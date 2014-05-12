(function () {
    var sendDataBackToWebview = function(webView, receptor, responseString) {
        var asyncOp = webView.invokeScriptAsync(receptor, responseString);
        asyncOp.oncomplete = function() {
        };
        asyncOp.onerror = function(err) {
            console.log("error during response to webview", err.target.result.description);
        };
        asyncOp.start();
    };

    XHRInterceptor = {
        Intercept: function (order, webView, uriResolver) {
            order.url = order.url.replace("http___", "http://");
            order.url = order.url.replace("https___", "https://");

            var index = order.url.lastIndexOf("http");
            if (index > -1) {
                order.url = order.url.substring(index);
            }

            var cacheKey = order.method + order.url + order.body; // generate unique key

            if (uriResolver.isInternetAvailable) { // Strategy here is to always get the latest version when online
                var oReq = new XMLHttpRequest;

                oReq.open(order.method, order.url, true); // Need to be saved for offline access
                oReq.onload = function() {
                    var responseHeaders = oReq.getAllResponseHeaders(); // Get headers back

                    var response = {
                        response: oReq.response,
                        responseText: oReq.responseText,
                        responseType: oReq.responseType,
                        responseXML: oReq.responseXML,
                        statusText: oReq.statusText,
                        callbackId: order.callbackId,
                        responseHeaders: responseHeaders
                    };

                    var responseString = JSON.stringify(response);

                    // Save to cache
                    uriResolver.saveToCacheAsync(cacheKey, responseString).done();

                    // Send back to webview
                    sendDataBackToWebview(webView, "getXhrCallbacks", responseString);
                };

                // Transmit headers
                for (var key in order.headers) {
                    oReq.setRequestHeader(key, order.headers[key]);
                }

                oReq.onerror = function(err) {

                };

                oReq.send(order.body);
            } else {
                uriResolver.getFromCacheAsync(cacheKey).then(function(responseString) {
                    // Send back to webview
                    sendDataBackToWebview(webView, "getXhrCallbacks", responseString);
                }, function() {
                    // TODO:Need to handle errors!
                });
            }
        }
    };
})();