#!/usr/bin/env python

"""
"""

from __future__ import print_function
import argparse
import codecs
import json
import logging

import bottle
from lru import LRU
from thrift.protocol import TJSONProtocol
from thrift.server import TServer
from thrift.transport import TTransport

from concrete import FetchRequest, FetchResult
from concrete.access import FetchCommunicationService
from concrete.search import SearchService, SearchProxyService
from concrete.util import lun, set_stdout_encoding
from concrete.util.access_wrapper import FetchCommunicationClientWrapper
from concrete.util.search_wrapper import SearchClientWrapper
from concrete.util.tokenization import get_comm_tokenizations



class RelayFetchCommunicationHandler(object):
    def __init__(self, host, port, lru_cache_size):
        self.host = host
        self.port = int(port)
        if lru_cache_size > 0:
            self.lru_cache_enabled = True
            self.lru_comms = LRU(lru_cache_size)
        else:
            self.lru_cache_enable = False
            self.lru_comms = None

    def about(self):
        logging.debug('RelayFetchCommunicationHandler.about()')
        with FetchCommunicationClientWrapper(self.host, self.port) as fc:
            return fc.about()

    def alive(self):
        logging.debug('RelayFetchCommunicationHandler.alive()')
        with FetchCommunicationClientWrapper(self.host, self.port) as fc:
            return fc.alive()

    def fetch(self, request):
        logging.debug('RelayFetchCommunicationHandler.fetch()')
        if self.lru_cache_enabled:
            # Only use LRU cache if all requested Communications are in the cache
            if all([comm_id in self.lru_comms for comm_id in request.communicationIds]):
                logging.debug('RelayFetchCommunicationHandler.fetch() - Retrieving Communications from LRU cache')
                result = FetchResult()
                result.communications = [self.lru_comms[comm_id] for comm_id in request.communicationIds]
                return result
        with FetchCommunicationClientWrapper(self.host, self.port) as fc:
            result = fc.fetch(request)
            if self.lru_cache_enabled:
                for comm in result.communications:
                    logging.debug('Caching Communication with ID "%s"' % comm.id)
                    self.lru_comms[comm.id] = comm
            return result

    def getCommunicationCount(self):
        logging.debug('RelayFetchCommunicationHandler.getCommunicationCount()')
        with FetchCommunicationClientWrapper(self.host, self.port) as fc:
            return fc.getCommunicationCount()

    def getCommunicationIDs(self, offset, count):
        logging.debug('RelayFetchCommunicationHandler.getCommunicationIDs()')
        with FetchCommunicationClientWrapper(self.host, self.port) as fc:
            return fc.getCommunicationIDs(offset, count)


class RelaySearchHandler(object):
    def __init__(self, host, port):
        self.host = host
        self.port = int(port)

    def about(self):
        logging.debug('RelaySearchHandler.about()')
        with SearchClientWrapper(self.host, self.port) as sc:
            return sc.about()

    def alive(self):
        logging.debug('RelaySearchHandler.alive()')
        with SearchClientWrapper(self.host, self.port) as sc:
            return sc.alive()

    def getCapabilities(self):
        logging.debug('RelaySearchHandler.getCapabilities()')
        with SearchClientWrapper(self.host, self.port) as sc:
            return sc.getCapabilities()

    def search(self, query):
        logging.debug('RelaySearchHandler.search()')
        with SearchClientWrapper(self.host, self.port) as sc:
            return sc.search(query)


class SearchProxyHandler(object):
    def __init__(self, search_providers):
        '''
        Args:
            search_providers (dict): Maps provider names to RelaySearchHandler instances
        '''
        self.search_providers = search_providers

    def about(self):
        logging.debug('SearchProxyHandler.about()')
        return ServiceInfo(
            name='SearchProxyHandler',
            version='0.0.1')

    def alive(self):
        logging.debug('SearchProxyHandler.alive()')
        return True

    def getCapabilities(self, provider):
        logging.debug('SearchProxyHandler.getCapabilities("%s")' % provider)
        return self.search_providers[provider].getCapabilities()

    def getCorpora(self, provider):
        logging.debug('SearchProxyHandler.getCorpora("%s")' % provider)
        return self.search_providers[provider].getCorpora()

    def getProviders(self):
        logging.debug('SearchProxyHandler.getProviders()')
        return self.search_providers.keys()

    def search(self, query, provider):
        logging.debug('SearchProxyHandler.search()')
        return self.search_providers[provider].search(query)


class SearchServer(object):
    # DANGER WILL ROBINSON!  We are using class variables
    # to store values accessed by the Bottle route functions
    # below.
    FETCH_HANDLER = None
    FETCH_TSERVER = None
    SEARCH_TSERVER = None
    SEARCH_PROXY_TSERVER = None
    STATIC_PATH = None

    def __init__(self, host, port, static_path, fetch_handler, search_handler, search_proxy_handler):
        self.host = host
        self.port = port

        SearchServer.FETCH_HANDLER = fetch_handler
        SearchServer.STATIC_PATH = static_path

        fetch_processor = FetchCommunicationService.Processor(fetch_handler)
        fetch_pfactory = TJSONProtocol.TJSONProtocolFactory()
        SearchServer.FETCH_TSERVER = TServer.TServer(
            fetch_processor, None, None, None, fetch_pfactory, fetch_pfactory)

        search_processor = SearchService.Processor(search_handler)
        search_pfactory = TJSONProtocol.TJSONProtocolFactory()
        SearchServer.SEARCH_TSERVER = TServer.TServer(
            search_processor, None, None, None, search_pfactory, search_pfactory)

        search_proxy_processor = SearchProxyService.Processor(search_proxy_handler)
        search_proxy_pfactory = TJSONProtocol.TJSONProtocolFactory()
        SearchServer.SEARCH_PROXY_TSERVER = TServer.TServer(
            search_proxy_processor, None, None, None, search_proxy_pfactory, search_proxy_pfactory)

    def serve(self):
        bottle.run(host=self.host, port=self.port)


@bottle.post('/fetch_http_endpoint/')
def search_http_endpoint():
    return thrift_endpoint(SearchServer.FETCH_TSERVER)


@bottle.post('/search_http_endpoint/')
def search_http_endpoint():
    return thrift_endpoint(SearchServer.SEARCH_TSERVER)


@bottle.post('/search_proxy_http_endpoint/')
def search_proxy_http_endpoint():
    return thrift_endpoint(SearchServer.SEARCH_PROXY_TSERVER)


@bottle.get('/get_sentence_text')
def get_sentence_text():
    communication_id = bottle.request.params['communication_id']
    sentence_uuid_string = bottle.request.params['sentence_uuid_string']
    fetch_request = FetchRequest()
    fetch_request.communicationIds = [communication_id]
    fetch_result = SearchServer.FETCH_HANDLER.fetch(fetch_request)
    if fetch_result.communications and len(fetch_result.communications) == 1:
        comm = fetch_result.communications[0]
        for section in lun(comm.sectionList):
            for sentence in lun(section.sentenceList):
                if sentence.uuid.uuidString == sentence_uuid_string:
                    return json.dumps({'sentence_text': comm.text[sentence.textSpan.start:sentence.textSpan.ending]})
        return json.dumps({'sentence_text': 'ERROR: Could not find Sentence with UUID %s' % sentence_uuid_string})
    else:
        return json.dumps({'sentence_text': 'ERROR: Could not find Communication with ID %s' + communication_id})


@bottle.route('/')
def homepage():
    return bottle.static_file('index.html', root=SearchServer.STATIC_PATH)


@bottle.route('/<filepath:path>')
def server_static(filepath):
    return bottle.static_file(filepath, root=SearchServer.STATIC_PATH)


def thrift_endpoint(tserver):
    """Thrift RPC endpoint
    """
    itrans = TTransport.TFileObjectTransport(bottle.request.body)
    itrans = TTransport.TBufferedTransport(
        itrans, int(bottle.request.headers['Content-Length']))
    otrans = TTransport.TMemoryBuffer()

    iprot = tserver.inputProtocolFactory.getProtocol(itrans)
    oprot = tserver.outputProtocolFactory.getProtocol(otrans)

    tserver.processor.process(iprot, oprot)
    bytestring = otrans.getvalue()

    headers = dict()
    headers['Content-Length'] = len(bytestring)
    headers['Content-Type'] = "application/x-thrift"
    return bottle.HTTPResponse(bytestring, **headers)


def main():
    set_stdout_encoding()

    parser = argparse.ArgumentParser(
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        description=''
    )
    parser.add_argument('--host', default='localhost', help='Host interface to listen on')
    parser.add_argument('-p', '--port', type=int, default=8080)
    parser.add_argument('--fetch-host', default='localhost')
    parser.add_argument('--fetch-port', default=9092)
    parser.add_argument('--search-host', default='localhost')
    parser.add_argument('--search-port', default=9090)
    parser.add_argument('-l', '--loglevel', '--log-level',
                        help='Logging verbosity level threshold (to stderr)',
                        default='info')
    parser.add_argument('--static-path', default='ui', help='Path where HTML files are stored')
    parser.add_argument('--lru-cache-size', type=int, default=0,
                        help='Size of LRU Communication cache.  Default is 0, which disables cache')
    args = parser.parse_args()

    logging.basicConfig(format='%(asctime)-15s %(levelname)s: %(message)s',
                        level=args.loglevel.upper())

    fetch_handler = RelayFetchCommunicationHandler(args.fetch_host, args.fetch_port, args.lru_cache_size)
    search_handler = RelaySearchHandler(args.search_host, args.search_port)
    search_proxy_handler = SearchProxyHandler({'default': search_handler})

    ss = SearchServer(args.host, args.port, args.static_path, fetch_handler, search_handler, search_proxy_handler)
    ss.serve()


if __name__ == '__main__':
    main()
