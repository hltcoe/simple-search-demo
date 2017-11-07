Simple Search Demo
==================

This repo contains a `Dockerfile` for a simple web application for
querying a Concrete SearchService server.

The repo also contains a `docker-compose.yml` file for standing up:

  - the web based UI on port 8080
  - a FetchCommunicationService on port 9090
  - a Lucene-based SearchService on port 9091

The `docker-compose.yml` file assumes that you have a Zip archive in
the current directory named `comms.zip` that contains the
Concrete Communications you want to search. 

Building the Search Index
-------------------------

Before you can search through the Communications, you must first index
them using Lucene with the command:

    ./build-index.sh

This shell script simply runs `docker-compose` to build the index.
The indexing process can take a while.  On one relatively new laptop,
the process took roughly 10 minutes per GB of (uncompressed)
Communication files, but your mileage will vary.

The search index only needs to be built once per Document Corpus.
The index files are stored on a
[Docker volume](https://docs.docker.com/engine/admin/volumes/volumes/)
named `simplesearchdemo_index_volume`.
This Docker volume persists across container restarts.  Reindexing a
Corpus will add duplicate search results to the existing search index.


Deleting the Search Index
-------------------------

To remove the search index volume file, you will first need to remove
any containers that use the volume.  First, make certain that all
containers for this application are stopped using:

    docker-compose down
	docker-compose rm

You may also need to remove all stopped containers using:

    docker container prune

Once all containers using the volume have been removed, you can remove
the search index volume using:

	docker volume rm simplesearchdemo_index_volume


Standing up the Search Application
----------------------------------

Once the search index has been created, you can stand up the search
application using the command:

    docker-compose up

You should now be able to interact with the search application by
going to:

http://localhost:8080


Using the Concretely Annotated WikiQA Corpus
--------------------------------------------

A Docker image containing a FetchCommunicationService service bundled
with the "WikiQA Corpus" is available on Docker Hub:

  https://hub.docker.com/r/hltcoe/fetch-wikiqa-corpus/

The WikiQA corpus is a subset of
[Concretely Annotated Gigaword (CAW)](http://dx.doi.org/10.7281/T1/D06YVM).
A more detailed description of the corpus is available on the GitHub
page for the Docker image:

  https://github.com/hltcoe/fetch-wikiqa-corpus

If you would like to use the WikiQA corpus, please follow the
instructions in the [docker-compose.yml](docker-compose.yml) file
for editing the Docker image used for the 'fetch' service.

Please note that the `fetch-wikiqa-corpus` Docker image does not
include a pre-built search index.  You must still follow the
instructions in the 'Building the Search Index' section above.
