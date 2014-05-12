(function () {
    var interceptAddEventListener = function (root) {
        var current = root.prototype ? root.prototype.addEventListener : root.addEventListener;

        var customAddEventListener = function (name, func, capture) {

            switch (name) {
                case "errorCustom":
                    current.call(this, "error", func, capture);
                    break;
                case "error":
                    if (!this._savedErrorHandlers) {
                        this._savedErrorHandlers = [];
                    }

                    this._savedErrorHandlers.push(func);
                    break;
                default:
                    current.call(this, name, func, capture);
                    break;
            }

        };

        if (root.prototype) {
            root.prototype.addEventListener = customAddEventListener;
        } else {
            root.addEventListener = customAddEventListener;
        }
    };

    interceptAddEventListener(HTMLImageElement);

    var secureImage = function(img) {
        if (!img._secure) {
            img._secure = true;

            img.addEventListener("errorCustom", function (evt) {
                var src = this.src;

                if (this._alreadyFixed) {
                    window.external.notify(JSON.stringify({ type: "LOG", message: "Image error: " + src }));

                    if (this._savedErrorHandlers) { // We were unable to fix src then call all registered error handlers
                        for (var index = 0; index < this._savedErrorHandlers.length; index++) {
                            this._savedErrorHandlers[index].call(this, evt);
                        }
                    }
                    return; // Prevents infinite loop
                }

                // Check common problems
                src = src.replace("ms-local-stream:http___", "ms-local-stream://");

                this._alreadyFixed = true;
                this.src = src;
            });
        }
    };

    document.addEventListener("DOMNodeInserted", function (evt) {
        var target = evt.target;
        if (target.nodeName == "IMG") {
            secureImage(target);
        }
    });


    document.addEventListener("DOMContentLoaded", function () {
        var imgs = document.querySelectorAll("img");

        for (var index = 0; index < imgs.length;index++){
            secureImage(imgs[index]);
        };
    });
})();
