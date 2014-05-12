(function (WAT) {
    "use strict";

    // Private method declaration
    var setupSearchCharm, handleSearchQuery, setupOnScreenSearch,
        logger = window.console;

    // Public API
    var self = {

        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            if (!WAT.config.search || WAT.config.search.enabled !== true || !WAT.config.search.searchURL) {
                return;
            }

            if (WAT.config.search.useOnScreenSearchBox === true) {
                setupOnScreenSearch();
            } else {
                setupSearchCharm();
            }
        }

    };

    setupSearchCharm = function () {
        try {
            if (Windows.ApplicationModel.Search.SearchPane.getForCurrentView()) {
                Windows.ApplicationModel.Search.SearchPane.getForCurrentView().onquerysubmitted = handleSearchQuery;
            }
        } catch (err) {
            // let's not crash the app for this...
            logger.error("Error initializing search charm:", err);
        }
    };

    setupOnScreenSearch = function () {
        var searchOptions = (WAT.config.search.onScreenSearchOptions || {}),
            searchBox = new WinJS.UI.SearchBox(WAT.options.searchBox, {
                chooseSuggestionOnEnter: (searchOptions.chooseSuggestionOnEnter !== false), // default to true
                focusOnKeyboardInput: !!searchOptions.focusOnKeyboardInput, // default to false
                placeholderText: (searchOptions.placeholderText || "search query"),
                searchHistoryDisabled: !!searchOptions.searchHistoryDisabled, // default to false
                searchHistoryContext: "wat-app-search", // static
                disabled: false
            });

        WAT.options.searchBox.style.display = "block";


        WinJS.UI.processAll().done(function () {
            WAT.options.searchBox.addEventListener("querysubmitted", handleSearchQuery);
        });
    };


    handleSearchQuery = function (e) {
        var query = e.queryText;

        if (e.detail.queryText) {
            query = e.detail.queryText;
        }

        var searchUrl = WAT.config.search.searchURL;
        WAT.goToLocation(searchUrl.replace("{searchTerm}", query));

    };


    // Module Registration
    WAT.registerModule("search", self);

})(window.WAT);