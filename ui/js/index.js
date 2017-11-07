/* globals
     CADET,
     concrete,
     FetchRequest,
     LRUMap,
     SearchQuery,
     SearchType
*/

// Global variables
var SEARCH_RESULT_TABLE;
var SEARCH_RESULT;
var COMMS_MAP;

function createResultsTable() {
    SEARCH_RESULT_TABLE = $('#results_table').DataTable({
        columns: [
            {
                title: 'Communication&nbsp;ID',
                render: function(data, type, searchResultItem) {
                    return searchResultItem.communicationId;
                },
                // Using a width of 1% causes Chrome, Firefox and Safari to render
                // this column as narrow as possible while still being wide enough
                // to accommodate the column's title.  This does not actually
                // set the column width to be only 1% of the table width.  Without
                // this styling, the width of this column was taking up over half
                // of the width of the table when this column is shown by default.
                width: '1%'
            },
            {
                title: 'Sentence ID',
                render: function(data, type, searchResultItem) {
                    if (searchResultItem.sentenceId) {
                        return searchResultItem.sentenceId.uuidString;
                    }
                    else {
                        return '';
                    }
                },
                visible: false
            },
            {
                title: 'Score',
                render: function(data, type, searchResultItem) {
                    return searchResultItem.score;
                },
                visible: false
            },
            {
                title: 'Text',
                className: 'search_result_item_text',
                render: function(data, type, searchResultItem) {
                    if (type === 'display') {
                        $.getJSON('/get_sentence_text',
                                  {'communication_id': searchResultItem.communicationId,
                                   'sentence_uuid_string': searchResultItem.sentenceId.uuidString},
                                  function(data) {
                                      $('#' + getIdForSearchResultItem(searchResultItem)).text(data.sentence_text);
                                  });

                        // Search result text will be updated when (asynchronous) getJSON() call [above] finishes
                        return '<span id="' + getIdForSearchResultItem(searchResultItem) + '">';
                    }
                    else { // type !== 'display'
                        return '';
                    }
                }
            }
        ],
        createdRow: function(row, searchResultItem, index) {
            // Add event handlers to DOM elements created by render()
            //
            // For more information about how to use DataTables' createdRow, see:
            //   https://datatables.net/examples/advanced_init/row_callback.html

            var searchResultItemId = SEARCH_RESULT.uuid.uuidString + '_' + index;
            // TODO: Append 'search_result_' to DOM id
            $('.search_result_item_text', row)
                .attr('id', searchResultItem.communicationId)
                .on('click',
                    {
                        'searchResultItem': searchResultItem,
                        'searchResultItemId': searchResultItemId,
                    },
                    openSearchResultTab);
        },

        // The deferRender option allows "lazy loading" of Communications via fetch()
        //   https://datatables.net/examples/ajax/defer_render.html
        deferRender: true,

        // The options for 'dom' are documented here:
        //   https://datatables.net/reference/option/dom
        // We are currently using the options:
        //   r - processing display element
        //   t - table
        //   i - table information summary
        //   p - pagination control
        dom: 'rtip',
        language: {
            emptyTable: 'No matching search results'
        },
    });
}

function addResultToResultsTable(searchResult) {
    SEARCH_RESULT = searchResult;
    SEARCH_RESULT_TABLE.clear();
    if (searchResult.searchResultItems.length > 0) {
        for (var i = 0; i < searchResult.searchResultItems.length; i++) {
            // We add an index to each SearchResultItem so that
            // getIdForSearchResultItem() will return a unique DOM ID
            // for the <span> for each SearchResultItem
            searchResult.searchResultItems[i].search_result_index = i;
        }
        SEARCH_RESULT_TABLE.rows.add(searchResult.searchResultItems);
    }
    SEARCH_RESULT_TABLE.draw();
}

function displayAndThrowError(error) {
    displayErrorMessage(error.message);
    throw error;
}

function displayErrorMessage(message) {
    $('#errors').html('<div class="alert alert-danger" role="alert">' + message + '</div>');
}

function executeSearchQuery(searchQuery) {
    // removes any previous error messages
    $('#errors').empty();

    if (CADET.defaultSearchProviders[CADET.getSearchTypeString(searchQuery.type)] === undefined) {
        displayErrorMessage('No search provider registered for search type ' +
                            CADET.getSearchTypeString(searchQuery.type));
        return;
    }

    var searchProvider;
    if (searchQuery.type === SearchType.COMMUNICATIONS) {
        searchProvider = CADET.defaultSearchProviders.COMMUNICATIONS;
    }
    else if (searchQuery.type === SearchType.SENTENCES) {
        searchProvider = CADET.defaultSearchProviders.SENTENCES;
    }

    CADET.search_proxy.search(searchQuery, searchProvider, true)
        .done(function(searchResult) {
            addResultToResultsTable(searchResult);

            $('a[href="#search_results"]').tab('show');
        });
}

function executeSearchQueryEventHandler(event) {
    executeSearchQuery(event.data.searchQuery);
}

function executeSearchQueryFromSearchBox() {
    var searchInput = document.getElementById('user_search').value;

    executeSearchQuery(CADET.createSearchQueryFromSearchString(searchInput, 'TODO: IGNORED'));
}

function getIdForSearchResultItem(searchResultItem) {
    return(concrete.util.selectorSafeString('' + searchResultItem.communicationId + '_' +
                                            searchResultItem.sentenceId.uuidString + '_' +
                                            searchResultItem.search_result_index));
}

/** Create a new tab containing the Communication text for a search result
 */
function openSearchResultTab(event) {
    var searchResultItem = event.data.searchResultItem;
    var searchResultItemId = event.data.searchResultItemId;

    // Add tab with Communication ID as title and an 'X' button for closing the tab
    $('#nav-tabs').append(
        $('<li>').append(
            $('<a>').attr('data-toggle', 'tab')
                    .attr('href', '#' + searchResultItemId)
                    .text(searchResultItem.communicationId)
                    .append(
                        // We are embedding the <span> with the remove ('X') link *in* the
                        // <a> link because of Bootstrap CSS rules that use the selectors
                        // ".nav-tabs>li>a" and ".nav>li>a".
                        $('<span>')
                            .addClass('glyphicon glyphicon-remove')
                            .css('margin-left', '0.5em')
                            .on('click', {'searchResultItemId': searchResultItemId}, function(event) {
                                // Remove the <div> with the tab content
                                $('#' + event.data.searchResultItemId).remove();
                                // Remove the tab
                                $(this).closest('li').remove();
                                // Show the Search Results tab
                                $('a[href="#search_results"]').tab('show');
                            }))));

    $('#tab-content').append('<div id="' + searchResultItemId +'" class="tab-pane"></div>');

    var request = new FetchRequest();
    request.communicationIds = [searchResultItem.communicationId];
    CADET.fetch.fetch(request, true).done(function(fetchResult) {
        if (fetchResult.communications && fetchResult.communications.length === 1) {
            // Add content to <div> for the newly created tab
            $('div #' + searchResultItemId).append(
                $('<div>').communicationWidget(fetchResult.communications[0]));

            $('a[href="#'+ searchResultItemId +'"]').tab('show');
        }
        else {
            displayErrorMessage('Unable to find Communication with ID "' + request.communicationIds[0] + '"');
        }
    });
}


function updateServiceStatus() {
    var services = ['search_proxy', 'fetch'];
    var serviceStatusMessage = '';
    var unavailableServices = [];

    for (var index in services) {
        try {
            if (!CADET[services[index]].alive()) {
                unavailableServices.push(services[index]);
                serviceStatusMessage += '<li>The ' + services[index] + ' service is not alive</li>';
            }
        }
        catch (error) {
            unavailableServices.push(services[index]);
            serviceStatusMessage += '<li>Error when trying to connect to ' + services[index] + ' service: ' +
                                    error.name + ' - ' + error.message +
                                    '</li>';
        }
    }
    if (unavailableServices.length > 0) {
        displayErrorMessage(serviceStatusMessage);
    }
}

// initialize all CADET clients
CADET.init();
COMMS_MAP = new LRUMap(35);

$(document).ready(function() {
    updateServiceStatus();

    // search box is focused on pageload
    $('#user_search').focus();

    // press enter key to trigger search button click handler
    $('#user_search, #query_name').bind('keypress', function(e) {
        if (e.keyCode===13) {
            executeSearchQueryFromSearchBox();
        }
    });
    createResultsTable();

    $('#search_button').on('click', executeSearchQueryFromSearchBox);
});
