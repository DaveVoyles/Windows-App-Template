(function () {

    if (XMLHttpRequest.__alreadyPatched === undefined) {
        window.XMLHttpRequest = function () {
            this._headers = {};
            this._responseHeaders = "";
            this.withCredentials = false;
        };

        window.XMLHttpRequest.__alreadyPatched = true;

        var root = "####URL####";

        // Storage space
        var globalId = 0;
        var waitingRequests = [];

        // Receptor: function to handle response from host
        window.getXhrCallbacks = function (responseString) {
            var response = JSON.parse(responseString);
            var xhr;

            for (var index = 0; index < waitingRequests.length; index++) {
                if (waitingRequests[index].callbackId == response.callbackId) {
                    xhr = waitingRequests[index];
                    waitingRequests.splice(index, 1);
                    break;
                }
            }

            if (responseString === "error") {
                xhr.readyState = 0; //READYSTATE_UNINITIALIZED
                xhr.status = 408; // request timeout
                xhr.statusText = "error";

                if (xhr.onreadystatechange) {
                    xhr.onreadystatechange();
                } else if (xhr.onerror) {
                    xhr.onerror();
                }
                return;
            }

            xhr.response = response.response;
            xhr.responseText = response.responseText;
            xhr.responseXML = response.responseXML;
            xhr.readyState = 4;
            xhr.status = 200;
            xhr.statusText = response.statusText;
            xhr.responseType = response.responseType;
            xhr._responseHeaders = response.responseHeaders;

            if (xhr.onreadystatechange) {
                xhr.onreadystatechange();
            } else if (xhr.onload) {
                xhr.onload();
            }
        };

        // Just block calls
        window.XMLHttpRequest.prototype.abort = function () {
        };

        window.XMLHttpRequest.prototype.send = function (body) {
            waitingRequests.push(this);
            
            this.callbackId = globalId;

            var order = {
                type: "XHR",
                url: this.__dataUrl,
                method: this.__dataMethod,
                callbackId: globalId++,
                headers: this._headers,
                body: body
            };
            
            window.external.notify(JSON.stringify(order));
        };

        // Get all required information
        window.XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
            if (url.indexOf("https://") == -1 && url.indexOf("http://") == -1) {

                if (url.indexOf("ms-local-stream") != -1) {
                    url = url.replace("ms-local-stream://", "");
                    var position = url.indexOf("/");
                    url = url.substring(position);
                }

                console.log(url + " was redirected to " + root + url);

                if (url[0] === '/') {
                    url = root + url;
                } else {
                    url = root + "/" + url;
                }
            }

            this.__dataUrl = url;
            this.__dataMethod = method;
        };

        // Headers - Nothing to do right now with headers
        window.XMLHttpRequest.prototype.setRequestHeader = function (index, header) {
            this._headers[index] = header;
            console.log(header);
        };

        window.XMLHttpRequest.prototype.getAllResponseHeaders = function () {
            return this._responseHeaders;
        };

        window.XMLHttpRequest.prototype.getResponseHeader = function (index) {
            return this._responseHeaders[index];
        };

        console.log("XHR hooked");
    }
})();
