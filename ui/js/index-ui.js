/* jshint esversion: 6 */
/* globals FetchCommunicationServiceClient,
           FetchRequest,
           SearchQuery,
           SearchServiceClient,
           SearchType,
           SummarizationRequest,
           SummarizationServiceClient,
           SummarySourceType,
           Thrift,
           UUID,
*/

function createSearchTermButton(entityId, weight, name) {

  function removeSearchTermButton(event) {
    $(this).parent().remove();

    // Remove 'search_and_similar' class from "Similar Entity" button
    // for this search term (if such a button exists)
    $('#similar_entity_button_' + selectorSafeString(event.data.entityId)).removeClass('search_and_similar');

    // Removing the 'search_and_similar' class doesn't cause this CSS rule to be re-applied:
    //   .search_and_similar .add_search_term {
    //      visibility: hidden;
    //   }
    // so we manually make the '+' button visible again.
    $('#similar_entity_button_' + selectorSafeString(event.data.entityId) + ' .add_search_term')
      .css('visibility', 'visible');
  }

  function updateSearchTermWeight() {
    let elem = $(this);
    let name = elem.attr('name');
    if (elem.attr('wtinput') === '0') {
      let weight = elem.attr('weight');
      let wtinput = $('<input type="text" size="4">').val(weight).on('keyup', (event) => {
        if (event.keyCode === 13) {
          elem.attr('weight', $(event.target).val());
          elem.text(name + ' (' + $(event.target).val() + ')');
          $(event.target).remove();
          elem.attr('wtinput', '0');
        }
      });
      elem.append(wtinput);
      elem.attr('wtinput', '1');
      wtinput.focus();
    }
  }


  return $('<div>')
    .css('display', 'inline-block')
    .css('margin', '1em')
    .append(
      $('<button>')
        .addClass('btn btn-default search_term_button')
        .attr('entityId', entityId)
        .attr('id', 'search_term_button_' + selectorSafeString(entityId))
        .attr('name', name)
        .attr('weight', weight)
        .attr('wtinput', "0")
        .css('margin', '0em')
        .text(name + ' (' + weight + ')')
        .click(
          updateSearchTermWeight))
    .append(
      $('<span>')
        .addClass('glyphicon glyphicon-remove')
        .css('cursor', 'pointer')
        .css('color', 'DarkGray')
        .click(
          {'entityId': entityId},
          removeSearchTermButton));
}


function searchHandler() {

  /**
   *
   */
  function addEntityMentionsForEntity(comm, entityId, selector) {
    var entity = comm.getEntityWithEntityId(entityId);
    if (entity && entity.mentionIdList) {
      for (var i = 0; i < entity.mentionIdList.length; i++) {
        var entityMention = comm.getEntityMentionWithUUID(entity.mentionIdList[i]);
        if (entityMention) {
          $(selector).addEntityMention(entityMention);
        }
      }
    }
  }

  function addJustification(justificationDiv, entityId) {
    $('#justification').append(
      $('<div>')
        .addClass('justification_text')
        .attr('id', 'justification_' + selectorSafeString(entityId))
        .css('display', 'none')
        .append(
          justificationDiv));
  }

  /**
   * @param {String} entityId
   * @param {boolean} entityIdIsSearchTerm
   */
  function addSimilarEntityButton(entityId, entityIdIsSearchTerm) {
    var classes = 'btn btn-default btn-sm similar_entity_button';
    if (entityIdIsSearchTerm) {
      classes += ' search_and_similar';
    }

    $('#similar_entities').append(
      $('<div>')
        .addClass(classes)
        .attr('id', 'similar_entity_button_' + selectorSafeString(entityId))
        .attr('type','button')
        .click(function() {
          updateSimilarEntityPanes(this, entityId);
        })
        .append(
          $('<span>')
            .append(
              $('<span>')
                .addClass('add_search_term glyphicon glyphicon-plus')
                .css('float', 'left')
                .css('padding-right', '0.8em')
                .click(function(event) {
                  // Don't add a button for this Entity if such a button already exists
                  if ($('#search_term_button_' + selectorSafeString(entityId)).length === 0) {
                    // The button already contains the Entity name, so we retrieve the
                    // entity name from the button instead of calling:
                    //    $.getJSON('/entity-id-to-name', {'entity_id': entityId}, replaceEntityIDWithEntityName);
                    var entityName = $(this).siblings().text();

                    $('#similar_entity_button_' + selectorSafeString(entityId)).addClass('search_and_similar');

                    $('#search_terms').append(
                      createSearchTermButton(entityId, '1.0', entityName));
                  }

                  // Clicking '+' should not cause this button's click-handler to be called
                  event.stopPropagation();
                }))
            .append(
              $('<span>')
                .attr('id', 'similar_entity_button_title_' + selectorSafeString(entityId)))));
  }

  function createJustificationTableRow(documentId, entityId, justificationHtml) {
    return $('<tr>')
      .append(
        $('<td>')
          .append(
            $('<button>')
              .addClass('btn btn-default btn-xs')
              .attr('type', 'button')
              .click(function() {
                $('#source_comm').empty();
                showDocumentCommunication(documentId, entityId, '#source_comm');
                $('#document_tabs a[href="#source_comm"]').tab('show');
              })
              .append(
                $('<span>')
                  .text(documentId))))
      .append(
        $('<td>')
          .html(justificationHtml));
  }

  /**
   * Retrieve a single Communication from the FetchCommunicationService.
   * Returns the Communication, or null if a Communication with that ID
   * cannot be found.
   *
   * @param {String} communicationId
   * @returns {Communication|null}
   */
  function getCommunication(communicationId) {
    var fetchTransport = new Thrift.Transport('/fetch_http_endpoint/');
    var fetchProtocol = new Thrift.TJSONProtocol(fetchTransport);
    var fetchClient = new FetchCommunicationServiceClient(fetchProtocol);

    var fetchRequest = new FetchRequest();
    fetchRequest.communicationIds = [communicationId];

    var fetchResult = fetchClient.fetch(fetchRequest);
    if (fetchResult.communications.length === 1) {
      return fetchResult.communications[0];
    }
    else {
      console.warn("Unable to fetch Communication with ID '" + communicationId + "'");
      return null;
    }
  }

  /**
   * Returns a jQuery XHR request object for a fetch() call, making
   * it possible to perform asynchronous fetch() calls.  If you use:
   *
   *   var fetchResult = fetchClient.fetch(fetchRequest);
   *
   * Thrift will try to call the FetchCommunicationService
   * synchronously, and if the Communication takes more than a few
   * seconds to serialize, the RPC call will timeout.
   *
   * For details about using jQuery XHR request objects, see:
   *
   *   https://api.jquery.com/jQuery.Ajax/
   *
   * Usage:
   *   getFetchJQXHR(communicationId)
   *     .done(function(fetchResult) {
   *       // fetchResult is a FetchResult object returned by fetch()
   *     });
   *
   * @param {String} communicationId
   * @returns {jqXHR}
   */
  function getFetchJQXHR(communicationId) {
    var fetchTransport = new Thrift.Transport('/fetch_http_endpoint/');
    var fetchProtocol = new Thrift.TJSONProtocol(fetchTransport);
    var fetchClient = new FetchCommunicationServiceClient(fetchProtocol);

    var fetchRequest = new FetchRequest();
    fetchRequest.communicationIds = [communicationId];

    return fetchClient.fetch(fetchRequest, true);
  }

  function replaceEntityIDWithEntityName(data) {
    $('#similar_entity_button_title_' + selectorSafeString(data.entity_id)).text(data.entity_name);
  }

  /**
   * Display the Communication text in the element specified by the
   * selector.
   *
   * @param {String} communicationId
   * @param {String} selector - Valid CSS selector string
   */
  function showDocumentCommunication(communicationId, entityId, selector) {
    getFetchJQXHR(communicationId).done(function(fetchResult) {
      if (fetchResult.communications.length === 1) {
        var comm = fetchResult.communications[0];
        $(selector)
          .append(
            $('<h3>').text(communicationId))
          .append(
            $('<div>').communicationWidget(comm));

        addEntityMentionsForEntity(comm, entityId, selector);
      }
    });
  }

  /**
   * Create an HTML table in the element specified by the selector.
   * Each row of the table is a sentence from the specified
   * Communication.  All tokens that are part of an EntityMention
   * in the Communication will have the 'entity_mention' class
   * added to them.
   *
   * @param {String} communicationId
   * @param {String} selector - Valid CSS selector string
   * @returns {UUID|null} - UUID of Entity-centric Communication
   */
  function showEntityCentricCommunicationAndSummary(communicationId, entityId, selector) {
    getFetchJQXHR(communicationId).done(function(fetchResult) {
      if (fetchResult.communications.length === 1) {
        var comm = fetchResult.communications[0];

        var sentences = comm.getSentencesAsList();
        var sentenceTable = $('<table>')
          .addClass('table table-condensed table-striped');

        for (var i = 0; i < sentences.length; i++) {
          sentenceTable.append(
            $('<tr>')
              .append(
                $('<td>')
                  .append(
                    $('<div>').sentenceWidget(sentences[i]))));
        }
        $(selector).append(sentenceTable);

        // The Synthetic Communications have two EntityMentionSets.  The 'PseudoDocumentCreator'
        // EntityMentionSet contains just the mentions for the Entity of interest.
        $(selector).addEntityMentionSet(comm.getEntityMentionSetWithToolname('PseudoDocumentCreator'));

        // The SummarizationService requires the UUID of the Entity Communication
        showSummary(comm.uuid, '#summary');
      }
    });
  }

  /**
   * @param {UUID} uuid
   * @param {String} selector - Valid CSS selector string
   */
  function showSummary(uuid, selector) {
    var summarizationTransport = new Thrift.Transport('/summarization_http_endpoint/');
    var summarizationProtocol = new Thrift.TJSONProtocol(summarizationTransport);
    var summarizationClient = new SummarizationServiceClient(summarizationProtocol);

    var summarizationRequest = new SummarizationRequest();
    summarizationRequest.sourceIds = [uuid];
    summarizationRequest.sourceType = SummarySourceType.ENTITY;
    var summary = summarizationClient.summarize(summarizationRequest);
    if (summary.summaryCommunication) {
      $('#summary').communicationWidget(summary.summaryCommunication);
    }
    else {
      console.error("No summary available for UUID " + uuid.uuidString);
    }
  }

  /**
   * Update 'Justification', 'Entity Content' and 'Summary' tab panes
   * with content for the Entity specified by entityId
   *
   * @param {} thisButton
   * @param {String} entityId
   */
  function updateSimilarEntityPanes(thisButton, entityId) {
    // Only one entity button can be active at a time
    $('.similar_entity_button').removeClass('active');
    $(thisButton).addClass('active');

    // Hide justification text for other entities
    $('.justification_text').hide();
    // Display justification text for this entity
    $('#justification_' + selectorSafeString(entityId)).show();

    $('#entity_comm').empty();
    $('#summary').empty();

    showEntityCentricCommunicationAndSummary(entityId, entityId, '#entity_comm');
  }


  // searchHandler() entry point:

  $('#entity_comm').empty();
  $('#justification').empty();
  $('#rationale').empty();
  $('#similar_entities').empty();
  $('#source_comm').empty();
  $('#summary').empty();

  var searchQuery = new SearchQuery();
  searchQuery.k = 25;
  searchQuery.type = SearchType.ENTITIES;
  let terms = [];
  let weights = [];
  $('#search_terms .search_term_button').each((idx, e) => {
    terms.push(e.getAttribute('entityId'));

    weights.push(e.getAttribute('weight'));
  });

  searchQuery.terms = terms;
  searchQuery.labels = weights;
  var transport = new Thrift.Transport('/search_http_endpoint/');
  var protocol = new Thrift.TJSONProtocol(transport);
  var searchClient = new SearchServiceClient(protocol);
  var searchResult = searchClient.search(searchQuery);

  var filteredLabels = [];
  for (var i = 0; i < searchResult.searchQuery.labels.length; i++) {
    var label = searchResult.searchQuery.labels[i];

    // Strip 'MENTION_' prefix, when applicable
    if (label.includes('MENTION_')) {
      label = label.split('MENTION_')[1];
    }
    if (!filteredLabels.includes(label) &&
        !label.includes('ENG_DF_') &&
        !label.includes('ENG_NW_') &&
        !label.includes('NYT_ENG_'))
    {
      filteredLabels.push(label);
    }
  }
  $('#rationale').text(filteredLabels.join(', '));

  for (i = 0; i < searchResult.searchResultItems.length; i++) {
    // The communicationId returned by nvbs.py does not contain a valid Communication ID,
    // but rather a long string containing an Entity ID, multiple Communication IDs, and
    // multiple justification text strings.  Here is a sample "communicationId" string:
    //   :Entity_ENG_EDL_0107139
    //   NYT_ENG_20130829.0032 conviction of doctor who helped cia hunt MENTION_bin MENTION_laden is overturned
    //   NYT_ENG_20130829.0032 MENTION_bin MENTION_laden was killed there in a navy seal raid in may 2011
    var nameJustification = searchResult.searchResultItems[i].communicationId.split('\n');
    var entityId = nameJustification[0];
    var justificationLines = nameJustification.slice(1);
    var justificationTable = $('<table>')
        .addClass('table table-condensed table-striped')
        .append(
          $('<tr>')
            .append($('<th>').text('Document'))
            .append($('<th>').text('Relevant sentence')));

    for (var j = 0; j < justificationLines.length; j++) {
      var tokens = justificationLines[j].split(' ');

      for (var k = 0; k < tokens.length; k++) {
        if (k === 0) {
          // Force conversion to string
          tokens[k] = '' + tokens[k] + '';
        }
        else {
          // Some tokens will be prefixed with 'MENTION_', e.g.:
          //   MENTION_bin MENTION_laden was killed there in a navy seal raid in may 2011
          // We strip the prefix and surround the token with a <mark> tag
          if (tokens[k].includes('MENTION_')) {
            tokens[k] = '<mark>' + tokens[k].split('MENTION_')[1] + '</mark>';
          }
        }
      }

      var documentId = tokens[0];
      var justificationHtml = tokens.slice(1).join(' ');
      justificationTable.append(createJustificationTableRow(documentId, entityId, justificationHtml));
    }

    addJustification(justificationTable, entityId);
    addSimilarEntityButton(entityId, terms.includes(entityId));

    $.getJSON('/entity-id-to-name', {'entity_id': entityId}, replaceEntityIDWithEntityName);
  }
}

/**
 * Takes a string, returns a version of the string that replaces
 * any of the CSS selector metacharacters:
 *   !"#$%&'()*+,./:;<=>?@[\]^`{|}~
 * with an underscore.  Per the jQuery documentation, these
 * metacharacters in CSS selector names if they are escaped with '\\',
 * but replacing them with underscores seems less likely to cause
 * strange behavior.
 *
 * Useful for handling Entity IDs that are prefixed with a colon,
 * e.g. ':Entity_ENG_EDL_0088070'.
 *
 * @param {String} s
 * @returns {String}
 */
function selectorSafeString(s) {
  return s.replace(/[!"#$%&'()*+,./:;<=>?@[\]^`{|}~]/g, '_');
}


$(document).ready(function() {

  // Add autocomplete functionality to search box
  $('#user_search').autocomplete({
    source: '/entity-autocomplete',
    minLength: 3,
    select: function(event, ui) {
      var weight = '1.0';
      $('#search_terms').append(
        createSearchTermButton(ui.item.value, weight, ui.item.label));
      // Clear text box
      $('#user_search').val('');
      // Prevent text box from being populated with Entity ID
      event.preventDefault();
    }
  });

  // Clicking "Clear" clears search-related content
  $('#clear_search_button').click(function() {
    $('#entity_comm').empty();
    $('#justification').empty();
    $('#rationale').empty();
    $('#search_terms').empty();
    $('#similar_entities').empty();
    $('#source_comm').empty();
    $('#summary').empty();
  });

  $('#search_button').click(searchHandler);

  $('#user_search').focus();
});
