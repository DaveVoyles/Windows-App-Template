﻿(function () {
    if (window.indexedDB === undefined) {
        var waitingRequests = [];
        var globalId = 0;

        var notify = function (method, details, requestToUse) {
            var order = {
                type: "IDB",
                method: method,
                details: details,
                callbackId: requestToUse ? requestToUse.callbackId : globalId++
            };
            window.external.notify(JSON.stringify(order));
        };

        var IDBOpenRequest = function () {
            this.onerror = null;
            this.onblocked = null;
            this.onsuccess = null;
            this.onupgradeneeded = null;
        };

        var IDBOpenCursorRequest = function () {
            this.onerror = null;
            this.onsuccess = null;
        };

        var IDBTransactionRequest = function () {
            this.onerror = null;
            this.onsuccess = null;
        };

        var IDBCursor = function (name, value, position, requestToUse) {
            this.value = value;
            this.name = name;
            this._position = position;

            this.continue = function () {
                waitingRequests.push(requestToUse); // Reusing same request for the events
                notify("OPENCURSOR", { name: name, position: this._position }, requestToUse);
            };
        };

        var IDBObjectStore = function (transaction, name) {
            this.transaction = transaction;
            this._name = name;

            this.openCursor = function () {
                var request = new IDBOpenCursorRequest();
                request.callbackId = globalId;
                request.result = this;

                waitingRequests.push(request);

                notify("OPENCURSOR", { name: name, position: 0 });

                return request;
            };

            this.clear = function () {
                this.transaction._orders.push({ store: name, order: "CLEAR" });
            };

            this.put = function (value) {
                this.transaction._orders.push({ store: name, order: "PUT", value: value });
            };

            this.delete = function (id) {
                this.transaction._orders.push({ store: name, order: "DELETE", id: id });
            };
        };

        var IDBTransaction = function (db, name, mode) {
            this.db = db;
            this._name = name;
            this._orders = [];

            this.objectStore = function (name) {
                if (this._name.length && this._name.indexOf(name) === -1) {
                    return null;
                }

                if (!this._name.length && this._name != name) {
                    return null;
                }

                return new IDBObjectStore(this, name);
            };

            if (mode) {
                var that = this;
                var request = new IDBTransactionRequest();
                request.callbackId = globalId;
                request.result = this;

                waitingRequests.push(request);

                setImmediate(function () { // We need to ensure that all orders where sent. So we need to be called after the current call stack
                    notify("TRANSACTION", { name: name, mode: mode, orders: that._orders });
                });
            }
        };

        // Receptor: function to handle response from host
        window.getIdbCallbacks = function (responseString) {
            var response = JSON.parse(responseString);
            var request;
            var index;

            for (index = 0; index < waitingRequests.length; index++) {
                if (waitingRequests[index].callbackId == response.callbackId) {
                    request = waitingRequests[index];

                    waitingRequests.splice(index, 1);
                    break;
                }
            }

            if (request instanceof IDBOpenRequest) { // Open DB
                switch (response.event) {
                    case "onerror":
                        if (request.onerror) {
                            request.onerror({ target: response.target });
                        }
                        break;
                    case "onblocked":
                        if (request.onblocked) {
                            request.onblocked({ target: response.target });
                        }
                        break;
                    case "onsuccess":
                        for (var store in response.stores) {
                            request.result.objectStoreNames.push(response.stores[store]);
                        }

                        if (request.onsuccess) {
                            request.onsuccess({ target: { result: request.result } });
                        }
                        break;
                }
            } else if (request instanceof IDBOpenCursorRequest) { // Open Cursor
                switch (response.event) {
                    case "onerror":
                        if (request.onerror) {
                            request.onerror({ target: response.target });
                        }
                        break;
                    case "onsuccess":
                        if (request.onsuccess) {
                            var cursor;

                            if (response.value) {
                                cursor = new IDBCursor(response.name, response.value, response.position + 1, request);
                            }

                            request.onsuccess({ target: { result: cursor } });
                        }
                        break;
                }
            } else if (request instanceof IDBTransactionRequest) { // Transaction
                switch (response.event) {
                    case "onabort":
                        if (request.result.onabort) {
                            request.result.onabort({ target: response.target });
                        }
                        break;
                    case "oncomplete":
                        if (request.result.oncomplete) {
                            request.result.oncomplete();
                        }
                        break;
                }
            }
        };

        // Overriding current IDB object
        window.indexedDB = {
            _stores: [],
            objectStoreNames: [],

            open: function (name, version) {
                var that = this;
                var request = new IDBOpenRequest();
                request.callbackId = globalId;
                request.result = this;

                waitingRequests.push(request);

                setImmediate(function () { // We need the code of the onupgradeneeded function so we need to be called AFTER the current stack was processed
                    // This is the *funky* part. We need to execute the code of onupgradeneeded BUT into the context of the TRUE onupgradeneeded event
                    // To do so, a regular expression is used to look for createObjectStore orders

                    if (request.onupgradeneeded) {
                        request.onupgradeneeded({ target: { result: request.result } });
                    }

                    notify("OPEN", { name: name, version: version, stores: that._stores });
                });

                return request;
            },
            createObjectStore: function (name, def) {
                this._stores.push({ name: name, def: def });
            },
            transaction: function (name, mode) {
                return new IDBTransaction(this, name, mode);
            }
        };

        console.log("IDB hooked");
    }
})();