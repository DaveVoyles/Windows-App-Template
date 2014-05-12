(function (WAT, WinJS, Windows) {
    "use strict";

    // Private method declaration
    var handleOfflineEvent,
        redirectToOfflineSolution,
        offlineViewLoaded,
        handleOnlineEvent,
        readScript,
        getOfflineFullRootURL,
        logger = window.console,
        lastOnlineLocation,
        defaultURL = "template/offline.html",
        localURLBase = "ms-appx:///";

    // C# URI resolver
    var uriResolver = new Tools.CustomResolver();
    uriResolver.onNotCachedFileDetected = function(uri) {
        // For you jeff :)
        // By default the resolver will display self.urlBase + self.rootURL as a temp page when offline content is not found
    };

    // Public API
    var self = {

        active: false,
        useSuperCache: false,
        urlBase: localURLBase,
        rootURL: defaultURL,

        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            WAT.config.offline = (WAT.config.offline || {});
            lastOnlineLocation = WAT.config.baseURL; // default last location to home page

            if (!WAT.options.offlineView) { return; }
            if (!WAT.config.offline.enabled) { return; }

            if (WAT.config.offline.rootURL) {
                // If they're providing a local root URL for offline functionality
                // then we'll use that instead of our template default
                self.urlBase = localURLBase;
                self.rootURL = WAT.config.offline.rootURL;
            }

            logger.log("Set offline solution url to: " + self.urlBase + self.rootURL);

            if (WAT.config.offline.useSuperCache) {
                uriResolver.defaultOfflineUri = self.urlBase + self.rootURL;
                this.useSuperCache = true; // Nest step will be handled when navigating

                WAT.options.webView.addEventListener("MSWebViewScriptNotify", function (e) {
                    var order = JSON.parse(e.value);

                    switch (order.type) {
                        case "XHR": // XHR interceptor
                            XHRInterceptor.Intercept(order, WAT.options.webView, uriResolver);
                            break;
                        case "IDB":
                            IDBInterceptor.Intercept(order, WAT.options.webView);
                            break;
                        case "LOG":
                            logger.log(order.message);
                            break;
                    }
                });

                return;
            }

            window.addEventListener("offline", handleOfflineEvent);
            window.addEventListener("online", handleOnlineEvent);

            WAT.options.offlineView.addEventListener("MSWebViewDOMContentLoaded", offlineViewLoaded);

            // If we're not online to start, go to offline solution, this could mean 
            // using the default solution if the zip is unavailable
            if (!window.navigator.onLine) {
                handleOfflineEvent();
            }
        },

        forceOffline: function () {
            var nav = WAT.getModule("nav");
            if (nav) {
                nav.removeExtendedSplashScreen();
            }
            handleOfflineEvent();
        },

        navigateOffline: function (root) {
            readScript("ms-appx:///template/js/offline/injectedXHR.js").then(function (xhrScript) {
                readScript("ms-appx:///template/js/idb/injectedIDB.js").then(function (idbScript) {
                    readScript("ms-appx:///template/js/guardBand/injectedGuardBand.js").then(function (guardBandScript) {
                        var page = "";

                        if (WAT.config.offline.baseDomainURL && root.indexOf(WAT.config.offline.baseDomainURL) !== -1) {
                            page = root.replace(WAT.config.offline.baseDomainURL, "");
                            root = WAT.config.offline.baseDomainURL;
                        }

                        var contentUri = WAT.options.webView.buildLocalStreamUri(root, page);

                        uriResolver.scriptsToInject = xhrScript;

                        if (WAT.config.offline.addIndexedDBSupport) {
                            uriResolver.scriptsToInject += idbScript;
                        }

                        if (WAT.config.offline.imagesGuardBand) {
                            uriResolver.scriptsToInject += guardBandScript;
                        }

                        WAT.options.webView.navigateToLocalStreamUri(contentUri, uriResolver);
                    });
                });
            });
        },

        serialize: function (args) {
            args.setPromise(uriResolver.serialize());
        },
    };

    // Private Methods

    handleOfflineEvent = function () {
        var uri;

        if (self.active) { return; }

        logger.info("Device is offline...", self.urlBase + self.rootURL);
        self.active = true;
        lastOnlineLocation = WAT.options.webView.src;

        // check for existence of offline rootURL file, use default if it doesn't exist
        uri = new Windows.Foundation.Uri(self.urlBase + self.rootURL);
        Windows.Storage.StorageFile.getFileFromApplicationUriAsync(uri)
            .then(
                redirectToOfflineSolution,
                function () {
                    logger.warn("Offline solution unavailable (" + self.urlBase + self.rootURL + "), reverting to default (" + localURLBase + defaultURL + ")");

                    self.urlBase = localURLBase;
                    self.rootURL = defaultURL;
                    redirectToOfflineSolution();
                }
            );
    };

    redirectToOfflineSolution = function () {
        var url = getOfflineFullRootURL();

        WAT.options.webView.style.display = "none";
        WAT.options.offlineView.style.display = "block";
        WAT.options.offlineView.navigate(url);
    },

    getOfflineFullRootURL = function () {
        return self.urlBase.replace(/ms\-appx\:/, "ms-appx-web:") + self.rootURL;
    };

    offlineViewLoaded = function () {
        var exec, scriptString;

        // inject the offline message if requested...
        if (WAT.config.offline.message) {
            scriptString = "var msg = document.querySelector('.offlineMessage');" +
                            "if (msg) { msg.innerHTML = '" + WAT.config.offline.message + "'; }";

            exec = WAT.options.offlineView.invokeScriptAsync("eval", scriptString);
            exec.start();
        }

        if (WAT.getModule("nav")) {
            if (WAT.options.offlineView.canGoBack === true) {
                WAT.getModule("nav").toggleBackButton(true);
            } else {
                WAT.getModule("nav").toggleBackButton(false);
            }
        }
    };

    handleOnlineEvent = function () {
        var loc = WAT.config.baseURL;

        if (!self.active) { return; }

        logger.info("Online connection restored, redirecting to " + loc);
        self.active = false;

        WAT.options.offlineView.style.display = "none";
        WAT.options.offlineView.navigate(getOfflineFullRootURL());
        WAT.options.webView.style.display = "block";

        WAT.goToLocation(loc);
    };

    readScript = function (filePath) {
        var uri = new Windows.Foundation.Uri(filePath);
        var inputStream = null;
        var reader = null;
        var size;

        return Windows.Storage.StorageFile.getFileFromApplicationUriAsync(uri).then(function (script) {
            return script.openAsync(Windows.Storage.FileAccessMode.read);
        }).then(function (stream) {
            size = stream.size;
            inputStream = stream.getInputStreamAt(0);
            reader = new Windows.Storage.Streams.DataReader(inputStream);

            return reader.loadAsync(size);
        }).then(function () {
            var contents = reader.readString(size);
            return contents;
        });
    };

    // Module Registration
    WAT.registerModule("offline", self);

})(window.WAT, window.WinJS, window.Windows);