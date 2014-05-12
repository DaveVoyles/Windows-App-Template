/*
Copyright (c) Microsoft Corporation

All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.  You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0   

THIS CODE IS PROVIDED *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE, MERCHANTABLITY OR NON-INFRINGEMENT.  

See the Apache Version 2.0 License for specific language governing permissions and limitations under the License. 


*/

(function (winJS) {
    "use strict";
    // Private method declarations
    var start, configLoadHandler, configErrorHandler, webViewLoaded, handleUncaughtErrors,
        // Private variable declarations
        loadTimeout,
        logger = window.console,
        modules = {},
        secondaryPinLocation = null,
        guids = [];

    // Public API
    window.WAT = {

        // Public variables
        version: "1.1",
        config: {},
        options: {},
        wrapperDocHead: null,

        // Public methods

        /**
         * Initialization script to start everything off.
         * @param {Object} options The collection of options
         * @return void (Use options.initCallback to get the result of the init call. A `null` value indicates success, anything else is an error.)
         */
        init: function (options) {
            var uri;

            WAT.options = options = (options || {});

            options.initCallback = (options.initCallback || function () { });

            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            WinJS.Application.addEventListener("error", handleUncaughtErrors);

            if (!options.stage ||
                !options.webView ||
                !options.backButton) {
                logger.error("One or more of the primary html elements of the wrapper html file were not provided to the WAT engine.");
                options.initCallback("One or more of the primary html elements of the wrapper html file were not provided to the WAT engine.");
            }

            WAT.wrapperDocHead = document.querySelector("head");

            options.configFile = "ms-appx:///" + (options.configFile || "config/config.json");

            logger.info("Getting config file from " + options.configFile);

            uri = new Windows.Foundation.Uri(options.configFile);
            Windows.Storage.StorageFile.getFileFromApplicationUriAsync(uri)
                .then(
                    configLoadHandler,
                    function (err) { configErrorHandler(err, 1); }
                );
        },

        activationHandler: function (e) {
            var namespace;

            if (e.detail.kind === Windows.ApplicationModel.Activation.ActivationKind.launch) {
                if (e.detail.arguments !== "") {
                    secondaryPinLocation = e.detail.arguments;
                }
            }

            for (namespace in modules) {
                if (modules[namespace].onActivated) {
                    logger.log("Calling onActivated for ", namespace);
                    modules[namespace].onActivated(e);
                }
            }
        },

        registerModule: function (namespace, module) {
            if (!namespace || !module || !module.start) {
                logger.warn("Unable to register module: ", namespace, module, module.start);
                return null;
            }

            logger.log("Registering module: ", namespace);
            modules[namespace.toString()] = module;
            return module;
        },

        getModule: function (namespace) {
            if (modules[namespace.toString()]) {
                return modules[namespace.toString()];
            } else {
                return null;
            }
        },

        goToLocation: function (location) {
            location = (location || WAT.config.baseURL);

            location = (location || WAT.config.baseURL);
            var offlineModule = WAT.getModule("offline");

            if (offlineModule && !offlineModule.useSuperCache) {
              //  loadTimeout = setTimeout(offlineModule.forceOffline, WAT.config.loadTimeoutMs);
            }

            if (offlineModule && offlineModule.useSuperCache) {
                offlineModule.navigateOffline(location);
            } else {
                WAT.options.webView.navigate(location);
            }
            //here we'll close the menus when we start to navigate

            if (WAT.config.appBar && WAT.config.appBar.enabled) {
                WAT.options.appBar.winControl.hide();
            }
            if (WAT.config.navBar && WAT.config.navBar.enabled) {
                WAT.options.navBar.parentNode.winControl.hide();
            }

        },

        escapeRegex: function (str) {
            return ("" + str).replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
        },

        convertPatternToRegex: function (pattern, excludeLineStart, excludeLineEnd) {
            var regexBody = WAT.escapeRegex(pattern);

            excludeLineStart = !!excludeLineStart;
            excludeLineEnd = !!excludeLineEnd;

            regexBody = regexBody.replace(/\\\?/g, ".?").replace(/\\\*/g, ".*?");
            if (!excludeLineStart) { regexBody = "^" + regexBody; }
            if (!excludeLineEnd) { regexBody += "$"; }

            return new RegExp(regexBody);
        },

        isFunction: function (f) {
            return Object.prototype.toString.call(f) == '[object Function]';
        },

        getGUID: function () {
            var newGUID = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            if (guids.indexOf(newGUID) > -1) {
                return self.getGUID();
            } else {
                return newGUID;
            }
        },

        /**
         * Promise completes with the lowest level folder in the given path, 
         * creating subfolders along the way
         * @param {String} path The path to the lowest subfolder you want a reference to
         * @param {StorageFolder} rootFolder The folder to begin at for this iteration
         * @return {Promise}
         */
        getFolderFromPathRecursive: function (path, rootFolder) {
            var normalizedPath = path.replace(/\\/g, "/").replace(/\/?[^\/]+\.[^\.\/]+$/, ""), // remove a possible filename from the end of the path and fix slashes
                folders = normalizedPath.split(/\//), // get an array of the folders in the path
                subFolderName = folders.shift(); // remove the first folder in the path as the new one to create

            return new WinJS.Promise(function (complete, error) {
                if (!subFolderName || !subFolderName.length) {
                    complete(rootFolder);
                    return;
                }

                rootFolder
                    .createFolderAsync(subFolderName, Windows.Storage.CreationCollisionOption.openIfExists)
                        .then(
                            function (folder) {
                                return WAT.getFolderFromPathRecursive(folders.join("/"), folder);
                            },
                            error
                        )
                        .then(
                            function (folder) {
                                complete(folder);
                                return;
                            },
                            error
                        )
            });
        },

        getWeekNumber: function (d) {
            var yearStart, week;

            d = (d || new Date());
            d = new Date(+d); // Copy date so don't modify original

            d.setHours(0, 0, 0);
            // Set to nearest Thursday: current date + 4 - current day number
            // Make Sunday's day number 7
            d.setDate(d.getDate() + 4 - (d.getDay() || 7));
            // Get first day of year
            yearStart = new Date(d.getFullYear(), 0, 1);
            // Calculate full weeks to nearest Thursday
            week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
            // Return array of year and week number (year may have changed)
            return [d.getFullYear(), week];
        },

        getFilesWithProperties: function (files) {
            var promises = [],
                filesWithProps = [];

            return new WinJS.Promise(function (complete, error) {
                files.forEach(function (file) {
                    promises.push(
                        file.getBasicPropertiesAsync().then(function (props) {
                            filesWithProps.push({
                                fileObject: file,
                                name: file.name,
                                dateModified: props.dateModified,
                                size: props.size
                            });
                        })
                    );
                });

                WinJS.Promise.join(promises).then(
                    function () {
                        complete(filesWithProps);
                    },
                    error
                );
            });
        }

    };


    // Private methods

    handleUncaughtErrors = function (e) {
        var alertMessage = "Sorry, but there was an error. Please contact us if the issue continues.",
            error = {
                message: (e.detail.errorMessage || e),
                url: e.detail.errorUrl,
                line: e.detail.errorLine,
                character: e.detail.errorCharacter
            };

        logger.error(error.message, error.url, error.line, error.character);

        if (WAT.config.errors && WAT.config.errors.showAlertOnError) {
            if (WAT.config.errors.alertMessage) {
                alertMessage = WAT.config.errors.alertMessage;
            }

            new Windows.UI.Popups.MessageDialog(alertMessage).showAsync();
        }

        if (WAT.config.errors && WAT.config.errors.redirectToErrorPage) {
            var url,
                baseUrl = "ms-appx-web:///",
                defaultErrorUrl = "template/error.html";

            if (WAT.config.errors.errorPageURL) {
                if (/^http/.test(WAT.config.errors.errorPageURL)) {
                    url = WAT.config.errors.errorPageURL;
                } else {
                    url = baseUrl + WAT.config.errors.errorPageURL;
                }

            } else {
                url = baseUrl + defaultErrorUrl;
            }

            WAT.goToLocation(url);
        }

        // Indicate that we have handled the error so the app does not crash
        return true;
    };

    start = function (configText) {
        var namespace;

        try {
            WAT.config = JSON.parse(configText);
        } catch (err) {
            configErrorHandler(err.message, 3);
            return;
        }

        // Start the logger first
        if (modules["log"]) {
            modules["log"].start();
        }

        logger.info("Starting application...");

        if (!WAT.config.baseURL && WAT.config.homeURL) {
            WAT.config.baseURL = WAT.config.homeURL;
        }

        WAT.config.loadTimeoutMs = (WAT.config.loadTimeoutMs || 10000);

        for (namespace in modules) {
            // the logger is started first above
            if (namespace !== "log") {
                logger.log("Calling start on ", namespace);
                modules[namespace].start();
            }
        }

        // TODO: catch MSWebViewUnviewableContentIdentified

        WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", webViewLoaded);
        WAT.goToLocation((secondaryPinLocation) ? secondaryPinLocation : WAT.config.baseURL);

        logger.info("...application initialized.");

        WAT.options.initCallback(null);
    };

    configLoadHandler = function (file) {
        Windows.Storage.FileIO.readTextAsync(file)
            .then(
                start,
                function (err) { configErrorHandler(err, 2); }
            );
    };

    configErrorHandler = function (err, i) {
        i = (i || 1);
        logger.error("Error while loading config (" + WAT.options.configFile + "): ", err);

        WAT.options.initCallback("Unable to initialize application config file (" + i + ").");
    };

    webViewLoaded = function () {
        clearTimeout(loadTimeout);
        loadTimeout = null;
    };

})(window.winJS);