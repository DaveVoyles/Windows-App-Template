(function (WAT) {
    "use strict";

    // Private method declaration
    var setupShare, handleShareRequest, getScreenshot, processScreenshot, sharePage, makeLink,
        logger = window.console;

    // Public API
    var self = {

        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            setupShare();
        }

    };

    // Private methods

    setupShare = function () {
        var dataTransferManager;

        if (!WAT.config.share || WAT.config.share.enabled !== true) {
            return;
        }
        
        dataTransferManager = Windows.ApplicationModel.DataTransfer.DataTransferManager.getForCurrentView();
        dataTransferManager.addEventListener("datarequested", handleShareRequest);
    };

    handleShareRequest = function (e) {
        var deferral = e.request.getDeferral();
        
        if (WAT.config.share.screenshot) {
            getScreenshot().then(
                function (imageFile) {
                    sharePage(e.request, deferral, imageFile);
                },
                function (err) {
                    // There was an error capturing, but we still want to share
                    logger.warn("Error capturing screenshot, sharing anyway", err);
                    sharePage(e.request, deferral, null);
                }
            );
        } else {
            sharePage(e.request, deferral, null);
        }
    };

    getScreenshot = function () {
        var screenshotFile;

        return new WinJS.Promise(function (complete, error) {

            if (!WAT.options.webView.capturePreviewToBlobAsync) {
                // screen capturing not available, but we still want to share...
                error(new Error("The capturing method (capturePreviewToBlobAsync) does not exist on the webview element"));
                return;
            }

            // we create the screenshot file first...
            Windows.Storage.ApplicationData.current.temporaryFolder.createFileAsync("screenshot.png", Windows.Storage.CreationCollisionOption.replaceExisting)
                .then(
                    function (file) {
                        // open the file for reading...
                        screenshotFile = file;
                        return file.openAsync(Windows.Storage.FileAccessMode.readWrite);
                    },
                    error
                )
                .then(processScreenshot, error)
                .then(
                    function () {
                        complete(screenshotFile);
                    },
                    error
                );
        });
    };

    processScreenshot = function (fileStream) {
        return new WinJS.Promise(function (complete, error) {
            var captureOperation = WAT.options.webView.capturePreviewToBlobAsync();

            captureOperation.addEventListener("complete", function (e) {
                var inputStream = e.target.result.msDetachStream();

                Windows.Storage.Streams.RandomAccessStream.copyAsync(inputStream, fileStream).then(
                    function () {
                        fileStream.flushAsync().done(
                            function () {
                                inputStream.close();
                                fileStream.close();
                                complete();
                            }
                        );
                    }
                );
            });

            captureOperation.start();
        });
    };

    makeLink = function (url) {
        return "<a href=" + url + ">" + url + "</a>";

    }

    sharePage = function (dataReq, deferral, imageFile) {
        var msg = WAT.config.share.message,
            currentURL = WAT.config.share.url.replace("{currentURL}", WAT.options.webView.src),
            html = WAT.config.share.message;

        var currentApp = Windows.ApplicationModel.Store.CurrentApp;
        var appUri;
        if (currentApp.appId != "00000000-0000-0000-0000-000000000000")
            appUri = cur.link.absoluteUri;
        else
            appUri = "Unplublished App, no Store link is available";

        msg = msg.replace("{url}", WAT.config.share.url).replace("{currentURL}", WAT.options.webView.src).replace("{appUrl}", appUri);
        html = html.replace("{currentUrl}", makeLink(WAT.config.share.url)).replace("{url}", makeLink(WAT.options.webView.src)).replace("{appUrl}", makeLink(appUri));

        var htmlFormat = Windows.ApplicationModel.DataTransfer.HtmlFormatHelper.createHtmlFormat(html);

        dataReq.data.properties.title = WAT.config.share.title;
        dataReq.data.setText(msg);
        dataReq.data.setHtmlFormat(htmlFormat);


        if (dataReq.data.setApplicationLink) {
            dataReq.data.setApplicationLink(new Windows.Foundation.Uri(currentURL));
        } else {
            dataReq.data.setUri(new Windows.Foundation.Uri(currentURL));
        }

        if (imageFile) {
            dataReq.data.setStorageItems([imageFile], true);
        }

        deferral.complete();
    };


    
    // Module Registration
    WAT.registerModule("share", self);

})(window.WAT);