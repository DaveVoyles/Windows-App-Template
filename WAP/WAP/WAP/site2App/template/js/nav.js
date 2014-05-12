(function (WAT, WinJS, Windows) {
    "use strict";

    // "icon" values are set to a value that mataches an icon name, 
    // the whole list of which are at the link below:
    // http://msdn.microsoft.com/en-us/library/windows/apps/hh770557.aspx

    // Private method & variable declarations
    var configureBackButton, webViewLoaded, webViewNavStart, navigateBack,
        setupLoadingContent, loadingPartialFileLoadHandler, 
        setupAppBar, setupNavBar, createNavBarButton, setButtonAction, initUIDeclarations, setStickyBits,
        injectNavbarBuildingQuery, processWebviewNavLinks, setupNestedNav, toggleNestedNav,
        handleBarEval, handleBarNavigate, handleBarSettings, handleBarShare,
        setupExtendedSplashScreen, updateSplashPositioning, updateExtendedSplashScreenStyles,
	    configureRedirects, addRedirectRule, processOldRedirectFormat,
        redirectShowMessage, redirectPopout, redirectUrl,
        loadWindowOpenSpy, loadWindowCloseSpy, handleWindowOpen, handleWindowClose, closeModalContent,
        splashScreenEl, splashScreenImageEl, splashLoadingEl,
        logger = window.console,
        barActions = {},
        splashScreen = null,
        backButtons = [],
        backButtonRules = [],
        redirectRules = [],
        redirectActions = {};


    // Public API
    var self = {

        start: function () {
            WAT.config.navigation = (WAT.config.navigation || {});

            WAT.config.navigation.hideOnPageBackButton = !!WAT.config.navigation.hideOnPageBackButton;

            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            configureBackButton();
            configureRedirects();
            
            setupLoadingContent();

            // when inner pages load, do these things...
            WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", webViewLoaded);
            // when inner navigation occurs, do some stuff
            WAT.options.webView.addEventListener("MSWebViewNavigationStarting", webViewNavStart);
            // when navigation is complete, remove the loading icon
            WAT.options.webView.addEventListener("MSWebViewNavigationCompleted", function () {
                self.toggleLoadingScreen(false);
            });

            updateExtendedSplashScreenStyles();

            barActions = {
                back: navigateBack,
                eval: handleBarEval,
                navigate: handleBarNavigate,
                settings: handleBarSettings,
                share: handleBarShare,
                nested: true
            };
            setupAppBar();
            setupNavBar();

            WinJS.UI.processAll().done(function () {
                WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", setStickyBits);
            });
        },

        toggleBackButton: function (isVisible) {
            var state,
                showBackButton = false;

            if (backButtons && backButtons.length) {
                // all back buttons should be in sync, so only toggle on first button's state
                state = backButtons[0].style.display;

                showBackButton = (isVisible === true || (isVisible === undefined && state === "none"));

                backButtons.forEach(function (btn) {
                    if (btn.id === "backbutton-wrapper") {
                        // on-page button (hidden vs disabled)
                        btn.style.display = (showBackButton && !WAT.config.navigation.hideOnPageBackButton) ? "block" : "none";
                    } else if (showBackButton) {
                        btn.classList.remove("disabled");
                    } else {
                        btn.classList.add("disabled");
                    }
                });
            }
        },

        toggleLoadingScreen: function (isLoading) {
            if (isLoading) {
                WAT.options.stage.classList.add("loading");
            } else {
                WAT.options.stage.classList.remove("loading");
            }
        },

        onActivated: function (e) {
            // On launch, we show an extended splash screen (versus the typical loading icon)
            if (e.detail.kind === Windows.ApplicationModel.Activation.ActivationKind.launch) {

                // disable nav and app bars until splash is removed
                if (WAT.options.navBar) {
                    WAT.options.navBar.disabled = true;
                }
                if (WAT.options.appBar) {
                    WAT.options.appBar.disabled = true;
                }

                // cached for use later
                splashScreen = e.detail.splashScreen;

                // Listen for window resize events to reposition the extended splash screen image accordingly.
                // This is important to ensure that the extended splash screen is formatted properly in response to snapping, unsnapping, rotation, etc...
                window.addEventListener("resize", updateSplashPositioning, false);

                setupExtendedSplashScreen();
                // Use setPromise to indicate to the system that the splash screen must not be torn down
                // until after processAll completes
                e.setPromise(WinJS.UI.processAll());
            }
        },

        parseURL: function (url) {
            var parsed, path,
                parser = document.createElement("a");
            parser.href = url;

            parsed = {
                protocol: parser.protocol, // => "http:"
                hostname: parser.hostname, // => "example.com"
                port: parser.port, // => "3000"
                pathname: parser.pathname, // => "/pathname/"
                search: parser.search, // => "?search=test"
                query: parser.search, // => "?search=test"
                hash: parser.hash, // => "#hash"
                host: parser.host // => "example.com:3000"
            };

            path = parsed.pathname.match(/(.+?\/)([^/]+\.[^/]+)?$/);
            if (path) {
                parsed.dirpath = path[1];
                parsed.file = path[2];
            } else {
                parsed.dirpath = parsed.pathname + "/";
                parsed.file = "";
            }

            return parsed;
        },

        removeExtendedSplashScreen: function () {
            if (splashScreenEl) {
                splashScreenEl.style.display = "none";
            }

            if (WAT.config.navBar && WAT.config.navBar.enabled && WAT.options.navBar) {
                WAT.options.navBar.disabled = false;
            }
            if (WAT.config.appBar && WAT.config.appBar.enabled && WAT.options.appBar) {
                WAT.options.appBar.disabled = false;
            }

            splashScreen = null;
        }

    };

    // Private methods

    configureBackButton = function () {
        var hideBackRules = WAT.config.navigation.hideBackButtonOnMatch;

        backButtonRules.push(WAT.convertPatternToRegex(WAT.config.baseURL));

        if (hideBackRules && hideBackRules.length) {
            hideBackRules.forEach(function (pattern) {
                var fullPattern, regex;

                if (!pattern || !pattern.length) {
                    logger.warn("Skipping invalid back button hide rule:", pattern);
                    return;
                }

                fullPattern = pattern.replace(/\{baseURL\}/g, WAT.config.baseURL);
                regex = WAT.convertPatternToRegex(fullPattern);
                if (regex) {
                    logger.log("Adding back button hide rule: ", pattern, regex);
                    backButtonRules.push(regex);
                }
            });
        }

        if (WAT.options.backButton && !WAT.config.navigation.hideOnPageBackButton) {
            // we need to hold onto the parent since that is what gets toggled, not the actual <button>
            backButtons.push(WAT.options.backButton.parentNode);
            
            // handle back button clicks
            WAT.options.backButton.addEventListener("click", navigateBack);
        }
    };

    configureRedirects = function () {
        redirectActions = {
            showMessage: redirectShowMessage,
            popout: redirectPopout,
            redirect: redirectUrl,
            modal: true
        };

        WAT.config.redirects = (WAT.config.redirects || {});

        if (WAT.config.redirects.enabled === true && WAT.config.redirects.rules && WAT.config.redirects.rules.length) {
            WAT.config.redirects.rules.forEach(addRedirectRule);

        } else if (WAT.config.redirects.enabled === true && WAT.config.redirects.links && WAT.config.redirects.links.length) {
            // support old format for redirects
            WAT.config.redirects.links.forEach(processOldRedirectFormat);
        }

        if (WAT.config.redirects.enableCaptureWindowOpen === true && WAT.options.dialogView) {
            WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", loadWindowOpenSpy);
            WAT.options.dialogView.addEventListener("MSWebViewDOMContentLoaded", loadWindowCloseSpy);

            WAT.options.webView.addEventListener("MSWebViewScriptNotify", handleWindowOpen);
            //WAT.options.dialogView.addEventListener("MSWebViewScriptNotify", handleWindowClose);

            WAT.options.dialogView.parentNode.addEventListener("click", closeModalContent);
        }
    };

    loadWindowOpenSpy = function () {
        var scriptString, exec;

        scriptString =
        "(function() {\n" +
            "var match, " +
                "openWindow = window.open;\n" +
            "window.open = function() {\n" +
                "console.log('intercepted window.open going to: ' + arguments[0]);\n" +
                "match = false;\n";

        // see if the request URL matches a redirect rule...
        redirectRules.forEach(function (rule) {
            if (rule.action === "modal") {
                scriptString += "if (" + rule.regex + ".test(arguments[0])) { match = true; }\n";
            }
        });

        scriptString +=
                "if (match) {\n" +
                    "window.external.notify('WINDOWOPEN~~' + arguments[0]);\n" +
                    "return null;\n" +
                "} else {\n" +
                    // if none of the redirect rules matched open as normal (external browser)
                    "return openWindow.apply(this, Array.prototype.slice.call(arguments));\n" +
                "}\n" +
            "};\n" + // end of window.open override
        "})();";

        exec = WAT.options.webView.invokeScriptAsync("eval", scriptString);
        exec.start();
    };

    handleWindowOpen = function (e) {
        var url, parsed, path, content;

        content = e.value.split(/~~/);
        if (content.length !== 2 || content[0] !== "WINDOWOPEN") {
            // oops, this isn't ours
            return;
        }

        logger.log("captured external window.open call to: ", e.value);

        url = content[1];
        if (!/^http/.test(url)) {
            if (/^\//.test(url)) {
                // path from root
                parsed = self.parseURL(WAT.config.baseURL);
                url = parsed.protocol + "//" + parsed.hostname + url;
            } else {
                // relative path
                parsed = self.parseURL(WAT.options.webView.src);
                url = parsed.protocol + "//" + parsed.hostname + parsed.dirpath + url;
            }
        }

        if (WAT.options.closeButton) {
            WAT.options.closeButton.style.display = "block";

            // Hide close button if requested for this URL
            if (WAT.config.redirects.enabled === true) {
                redirectRules.forEach(function (rule) {
                    if (rule.regex.test(url) && rule.hideCloseButton === true) {
                        WAT.options.closeButton.style.display = "none";
                    }
                });
            }
        }

        WAT.options.dialogView.navigate(url);
        WAT.options.dialogView.parentNode.style.display = "block";
    };

    loadWindowCloseSpy = function (e) {
        var scriptString, exec,
            modalClosed = false;

        WAT.options.dialogView.addEventListener("MSWebViewScriptNotify", handleWindowClose);

        // See if we need to close the modal based on URL
        if (WAT.config.redirects.enabled === true) {
            redirectRules.forEach(function (rule) {
                if (rule.action === "modal" && rule.closeOnMatchRegex && rule.closeOnMatchRegex.test(e.uri)) {
                    modalClosed = true;
                    closeModalContent();
                }
            });
            if (modalClosed) {
                return; // nothing else to do, the modal is closed
            }
        }
        
        scriptString =
        "(function() {\n" +
            "var closeWindow = window.close;\n" +
            "window.close = function() {\n" +
                "console.log('intercepted window.close');\n" +
                "window.external.notify('WINDOWCLOSE~~' + window.location.href);\n" +
                "return;\n" +
            "};\n" + // end of window.close override
        "})();";

        exec = WAT.options.dialogView.invokeScriptAsync("eval", scriptString);
        exec.start();
    };

    handleWindowClose = function (e) {
        var content;

        content = e.value.split(/~~/);
        if (content.length !== 2 || content[0] !== "WINDOWCLOSE") {
            // oops, this isn't ours
            return;
        }

        logger.log("captured external window.close call: ", e.value);

        closeModalContent();
    };

    closeModalContent = function () {
        WAT.options.dialogView.src = "about:blank";
        WAT.options.dialogView.parentNode.style.display = "none";

        if (WAT.config.redirects.refreshOnModalClose === true) {
            WAT.options.webView.refresh();
        }
    };

    addRedirectRule = function (rule) {
        var ruleCopy = { original: rule };

        if (!redirectActions[rule.action]) {
            logger.warn("Looks like that is an invalid redirect action... ", rule.action);
            return;
        }

        ruleCopy.pattern = rule.pattern.replace(/\{baseURL\}/g, WAT.config.baseURL);
        ruleCopy.regex = WAT.convertPatternToRegex(ruleCopy.pattern);

        ruleCopy.action = rule.action;
        ruleCopy.message = rule.message || "";
        ruleCopy.url = (rule.url) ? rule.url.replace(/\{baseURL\}/g, WAT.config.baseURL) : "";
        
        ruleCopy.hideCloseButton = rule.hideCloseButton || false;
        ruleCopy.closeOnMatch = rule.closeOnMatch || null;
        if (rule.closeOnMatch) {
            ruleCopy.closeOnMatchRegex = WAT.convertPatternToRegex(rule.closeOnMatch);
        } else {
            rule.closeOnMatchRegex = null;
        }

        logger.info("Adding redirect rule (" + ruleCopy.action + ") with pattern/regex: " + ruleCopy.pattern, ruleCopy.regex);

        redirectRules.push(ruleCopy);
    };

    processOldRedirectFormat = function (rule) {
        var actionMatch,
            newRule = { action: null, link: rule };

        newRule.pattern = rule.link;
        actionMatch = rule.action.match(/^showMessage\:\s*(.*)/);
        if (actionMatch) {
            newRule.action = "showMessage";
            newRule.message = actionMatch[1];
        } else {
            newRule.action = "redirect";
            newRule.url = rule.action;
        }

        addRedirectRule(newRule);
    };

    webViewNavStart = function (e) {
        self.toggleLoadingScreen(true);

        // Follow any redirect rules
        if (WAT.config.redirects.enabled === true) {
            redirectRules.forEach(function (rule) {
                if (rule.regex.test(e.uri) && WAT.isFunction(redirectActions[rule.action])) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    redirectActions[rule.action](rule, e.uri);
                    self.toggleLoadingScreen(false);
                }
            });
        }
    };

    navigateBack = function (e) {
        var view = WAT.options.webView;

        if (e.currentTarget.getAttribute("disabled") === "disabled") {
            e.preventDefault();
            return false;
        }

        var offlineModule = WAT.getModule("offline");
        if (offlineModule && offlineModule.active && WAT.options.offlineView && !offlineModule.useSuperCache) {
            view = WAT.options.offlineView;
        }

        try {
            view.goBack();
        } catch (err) {
            // TODO: Do we not care about these errors?
        }

        if (WAT.config.appBar && WAT.config.appBar.enabled) {
            WAT.options.appBar.winControl.hide();
        }
        if (WAT.config.navBar && WAT.config.navBar.enabled) {
            WAT.options.navBar.parentNode.winControl.hide();
        }



    };

    webViewLoaded = function () {
        var showBackButton = true;

        if (splashScreen) {
            self.removeExtendedSplashScreen();
        }

        if (WAT.options.webView.canGoBack === true) {
            backButtonRules.forEach(function (rule) {
                if (rule.test(WAT.options.webView.src)) {
                    showBackButton = false;
                }
            });
        } else {
            showBackButton = false;
        }

        if (WAT.config.header && WAT.config.header.enabled === true) {
            var header = WAT.getModule("header");

            if (header)
                header.setPageTitle(!showBackButton);
        }

        self.toggleBackButton(showBackButton);
    };

    setupLoadingContent = function () {
        var partial;

        if (!WAT.config.navigation.pageLoadingPartial || !WAT.options.loadingWrapper) {
            return;
        }

        partial = "ms-appx://" + ((/^\//.test(WAT.config.navigation.pageLoadingPartial)) ? "" : "/") + WAT.config.navigation.pageLoadingPartial;

        logger.log("Getting loading partial file from " + partial);

        var url = new Windows.Foundation.Uri(partial);
        Windows.Storage.StorageFile.getFileFromApplicationUriAsync(url)
            .then(
                loadingPartialFileLoadHandler,
                function (err) {
                    // log this error, but let things proceed anyway
                    logger.error("Error getting custom loading partial file", err);
                }
            );
    };

    loadingPartialFileLoadHandler = function (file) {
        Windows.Storage.FileIO.readTextAsync(file)
            .then(
                function (text) {
                    WAT.options.loadingWrapper.innerHTML = text;
                },
                function (err) {
                    // log this error, but let things proceed anyway
                    logger.warn("Error reading custom loading partial file", err);
                }
            );
    };


    // app and nav bar setup

    setupAppBar = function () {
        var appBarEl = WAT.options.appBar;

        WAT.config.appBar = (WAT.config.appBar || {});

        if (!WAT.config.appBar.enabled || !appBarEl) {
            if (appBarEl) {
                appBarEl.parentNode.removeChild(appBarEl);
                appBarEl = null;
            }
            return;
        }

        WAT.config.appBar.buttons = (WAT.config.appBar.buttons || []);

        WAT.config.appBar.buttons.forEach(function (menuItem) {
            var btn = document.createElement("button");
            btn.className = "win-command win-global";
            btn.setAttribute("role", "menuitem");

            new WinJS.UI.AppBarCommand(btn, { label: menuItem.label, icon: menuItem.icon });

            setButtonAction(btn, menuItem);

            appBarEl.appendChild(btn);
        });
    };

    setupNavBar = function () {
        var needSplitEvent = false,
            navBarEl = WAT.options.navBar;

        WAT.config.navBar = (WAT.config.navBar || {});

        if (!WAT.config.navBar.enabled || !navBarEl) {
            if (navBarEl) {
                // we have to remove the WinJS.UI.NavBar control, but the 
                // "navBar" option passes in the WinJS.UI.NavBarConatiner
                navBarEl.parentNode.parentNode.removeChild(navBarEl.parentNode);
                navBarEl = null;
            }
            return;
        }

        WAT.config.navBar.maxRows = (WAT.config.navBar.maxRows || 1);

        // Add explicit buttons first...
        if (WAT.config.navBar.buttons) {
            WAT.config.navBar.buttons.forEach(function (menuItem) {
                var btn = createNavBarButton(menuItem);

                if (btn) {
                    navBarEl.appendChild(btn);
                }
                if (menuItem.children && menuItem.children.length) {
                    needSplitEvent = true;
                }
            });
        }

        // Then any pageElement nav requested by config...
        if (WAT.config.navBar.pageElements && WAT.config.navBar.pageElements.navElements) {

            WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", injectNavbarBuildingQuery);

        } else {
            // If we are not processing webview nav elements then we are ready to process the nav bar UI declarations
            initUIDeclarations();
        }

        // If there was at least one navbar item with children, set up splitt toggle event...
        if (needSplitEvent) {
            navBarEl.addEventListener("splittoggle", function (e) {
                toggleNestedNav(e.detail.navbarCommand, e.detail.opened);
            });
        }
    };

    initUIDeclarations = function () {
        WAT.options.navBar.parentNode.setAttribute("data-win-control", "WinJS.UI.NavBar");
        WAT.options.navBar.setAttribute("data-win-control", "WinJS.UI.NavBarContainer");
        WAT.options.navBar.setAttribute("data-win-options", "{ maxRows: " + WAT.config.navBar.maxRows + " }");
    };

    setStickyBits = function () {
        var appBarHeight, navHeight,
            height = (parseInt(WAT.options.stage.offsetHeight) || 0);

        WAT.options.webView.removeEventListener("MSWebViewDOMContentLoaded", setStickyBits);

        if (WAT.config.navBar && WAT.config.navBar.enabled === true && WAT.config.navBar.makeSticky) {
            WAT.options.navBar.disabled = false;
            WAT.options.navBar.parentNode.winControl.sticky = true;
            WAT.options.navBar.parentNode.winControl.show();

            WAT.options.navBar.parentNode.winControl.addEventListener("afterhide", function (e) {
                WAT.options.navBar.parentNode.winControl.show();
            });

            navHeight = (parseInt(WAT.options.navBar.parentNode.offsetHeight) || 0);
            
            height -= navHeight;
            WAT.options.stage.style.paddingTop = '30px';
            WAT.options.stage.style.top = navHeight + "px";
            WAT.options.backButton.parentNode.style.top = navHeight + "px";
        }

        if (WAT.config.appBar && WAT.config.appBar.enabled === true && WAT.config.appBar.makeSticky) {
            WAT.options.appBar.disabled = false;
            WAT.options.appBar.winControl.sticky = true;
            WAT.options.appBar.winControl.show();

            WAT.options.appBar.winControl.addEventListener("afterhide", function (e) {
                WAT.options.appBar.winControl.show();
            });

            appBarHeight = (parseInt(WAT.options.appBar.offsetHeight) || 0);

            height -= appBarHeight;
        }

       // WAT.options.stage.style.height = height + "px";
       // WAT.options.webView.style.height = height + "px";
       // WAT.options.offlineView.style.height = height + "px";
    };

    createNavBarButton = function(menuItem) {
        var btn = document.createElement("div"),
            hasChildren = !!(menuItem.children && menuItem.children.length),
            options = { label: menuItem.label, icon: menuItem.icon, splitButton: hasChildren };

        btn.setAttribute("role", "menuitem");

        new WinJS.UI.NavBarCommand(btn, options);

        if (hasChildren) {
            // set up nested navigation if children are present
            setupNestedNav(menuItem, btn);
        }

        setButtonAction(btn, menuItem);

        return btn;
    };

    injectNavbarBuildingQuery = function () {
        var scriptString, exec,
            config = WAT.config.navBar.pageElements;

        WAT.options.webView.removeEventListener("MSWebViewDOMContentLoaded", injectNavbarBuildingQuery);

        config.linkAttribute = (config.linkAttribute || "href");

        WAT.options.webView.addEventListener("MSWebViewScriptNotify", processWebviewNavLinks);

        scriptString = "(function() {" +
                         "var navItem, linkElem, textElem, iconElem;" +
                         "var navItems = [];" +
                         "var navElements = document.querySelectorAll(\"" + config.navElements + "\");" +
                         "if (navElements && navElements.length) {" +
                           "for (var i = 0; i < navElements.length; ++i) {" +
                             "navItem = { label: '', action: 'home', icon: 'link' };" +
                             "linkElem = navElements[i];" +
                             "textElem = iconElem = null;";

        // get nav button link action (url)
        if (config.linkElement) {
            scriptString +=  "linkElem = navElements[i].querySelector(\"" + config.linkElement + "\");";
        }
        scriptString +=      "if (!linkElem) { continue; }" +
                             "navItem.action = linkElem.getAttribute('" + config.linkAttribute + "');";

        // get nav button text
        scriptString +=      "textElem = linkElem;";
        if (config.textElement) {
            scriptString +=  "textElem = navElements[i].querySelector(\"" + config.textElement + "\");";
        }
        scriptString +=      "if (!textElem) { textElem = linkElem; }" +
                             "navItem.label = (textElem.text || '');";

        // get nav button icon (if specified)
        if (config.iconElement && config.iconAttribute) {
            scriptString +=  "iconElem = navElements[i].querySelector(\"" + config.iconElement + "\");";
        }
        scriptString +=      "if (iconElem) {" +
                               "navItem.icon = iconElem.getAttribute('" + config.iconAttribute + "');" +
                             "}" +
                             
                             "navItems.push(navItem);" +
                           "}" +
                         "}" +
                         "window.external.notify('NAVDATA~~' + JSON.stringify(navItems));" +
                       "})();";

        exec = WAT.options.webView.invokeScriptAsync("eval", scriptString);
        exec.start();
    };

    processWebviewNavLinks = function (e) {
        var content, navItems,
            navBarEl = WAT.options.navBar;

        content = e.value.split(/~~/);
        if (content.length < 2 || content[0] !== "NAVDATA") {
            // oops, this isn't ours
            return;
        }

        WAT.options.webView.removeEventListener("MSWebViewScriptNotify", processWebviewNavLinks);

        logger.log("captured script notify event for nav elements: ", e.value);

        try {
            navItems = JSON.parse(content[1]);
        } catch(err) {
            logger.error("Unable to parse nav items from webview: ", err);
            navItems = [];
        }

        if (navItems && navItems.length) {
            WAT.navItems = new WinJS.Binding.List(navItems);

            navItems.forEach(function (menuItem) {
                logger.log("creating button with: ", menuItem);

                var btn = createNavBarButton(menuItem);

                if (btn) {
                    navBarEl.appendChild(btn);
                }
            });

            initUIDeclarations();
        }
    };

    setupNestedNav = function (menuItem, btn) {
        var nestedNavID = WAT.getGUID(),
            flyout = document.createElement("div"),
            nestedNavContainer = document.createElement("div");

        logger.log("Adding nested navigation on barItem: ", menuItem.label);

        flyout.setAttribute("id", nestedNavID);
        flyout.setAttribute("data-win-control", "WinJS.UI.Flyout");
        flyout.setAttribute("data-win-options", "{ placement: 'bottom' }");
        flyout.className += flyout.className ? ' navbar-submenu' : 'navbar-submenu';

        btn.setAttribute("data-nestednav", nestedNavID);
        nestedNavContainer.setAttribute("data-win-control", "WinJS.UI.NavBarContainer");

        menuItem.children.forEach(function (subItem) {
            var nestedBtn = document.createElement("div");

            nestedBtn.setAttribute("role", "menuitem");

            new WinJS.UI.NavBarCommand(nestedBtn, {
                label: subItem.label,
                icon: subItem.icon
            });

            setButtonAction(nestedBtn, subItem);
            nestedNavContainer.appendChild(nestedBtn);
        });

        logger.log("Adding nested navigation UI to DOM");

        flyout.appendChild(nestedNavContainer);
        document.body.appendChild(flyout);

        WinJS.UI.processAll()
            .then(function () {
                // make sure the splittoggle button (arrow) is correct
                flyout.winControl.addEventListener('beforehide', function () {
                    btn.winControl.splitOpened = false;
                });
            });
    };

    toggleNestedNav = function (parentNavbarCommand, opened) {
        var nestedControl = document.getElementById(parentNavbarCommand.element.getAttribute("data-nestednav")).winControl,
            nestedNavBarContainer = (nestedControl && nestedControl.element.querySelector('.win-navbarcontainer'));

        if (!nestedControl || !nestedNavBarContainer) {
            return;
        }

        if (opened) {
            nestedControl.show(parentNavbarCommand.element);
            // Switching the navbarcontainer from display none to display block requires 
            // forceLayout in case there was a pending measure.
            nestedNavBarContainer.winControl.forceLayout();
            // Reset back to the first item.
            nestedNavBarContainer.currentIndex = 0;

        } else {
            nestedControl.hide();
        }
    };

    setButtonAction = function (btn, menuItem) {
        var action = menuItem.action.toLowerCase(),
            data = menuItem.data,
            handler = barActions[action];

        if (!handler) {
            // default handler is webview navigation
            handler = barActions["navigate"];
            data = menuItem.action;
        }

        if (!WAT.isFunction(handler)) {
            // This is a non-operational bar item (maybe nested nav?)
            return;
        }

        if (data === "home") {
            data = WAT.config.baseURL;
        }

        if (action === "back") {
            backButtons.push(btn);
        }

        btn.dataset.barActionData = data;
        //handle children case
        if (menuItem.children && menuItem.children.length) {
            btn.children[0].addEventListener("click", handler);
        } else {

        btn.addEventListener("click", handler);
        }
        
    };


    // app and nav bar action handlers

    handleBarEval = function () {
        var scriptString, exec;

        scriptString = "(function() { " + this.dataset.barActionData + " })();";

        exec = WAT.options.webView.invokeScriptAsync("eval", scriptString);
        exec.start();
    };

    handleBarNavigate = function () {
        //if dataset doesn't exist, look for parent, becuse it will be a nested button assignment that is a child
        var url = (this.dataset.barActionData || this.parentNode.dataset.barActionData || WAT.config.baseURL);
        WAT.goToLocation(url);
    };

    handleBarSettings = function () {
        Windows.UI.ApplicationSettings.SettingsPane.show();
    };

    handleBarShare = function () {
        Windows.ApplicationModel.DataTransfer.DataTransferManager.showShareUI();
    };


    // redirect rule action handlers

    redirectShowMessage = function (rule) {
        logger.log("Showing message: " + rule.message);
        return new Windows.UI.Popups.MessageDialog(rule.message).showAsync();
    };

    redirectPopout = function (rule, linkUrl) {
        logger.log("Popping out URL to: " + linkUrl);
        return Windows.System.Launcher.launchUriAsync(new Windows.Foundation.Uri(linkUrl));
    };

    redirectUrl = function (rule) {
        logger.log("Redirecting user to link in app: " + rule.url);

        WAT.goToLocation(rule.url);
    };


    // spash screen functionality

    setupExtendedSplashScreen = function () {
        splashScreenEl = WAT.options.extendedSplashScreen;
        splashScreenImageEl = (splashScreenEl && splashScreenEl.querySelector(".extendedSplashImage"));
        splashLoadingEl = (splashScreenEl && splashScreenEl.querySelector(".loading-progress"));

        if (!splashScreen || !splashScreenEl || !splashScreenImageEl) { return; }

        updateSplashPositioning();
        // Once the extended splash screen is setup, apply the CSS style that will make the extended splash screen visible.
        splashScreenEl.style.display = "block";
    };

    updateExtendedSplashScreenStyles = function () {
        if (WAT.config.styles && WAT.config.styles.extendedSplashScreenBackground && splashScreenEl) {
            splashScreenEl.style.backgroundColor = WAT.config.styles.extendedSplashScreenBackground;
        }
    };

    updateSplashPositioning = function () {
        if (!splashScreen || !splashScreenImageEl) { return; }
        // Position the extended splash screen image in the same location as the system splash screen image.
        splashScreenImageEl.style.top = splashScreen.imageLocation.y + "px";
        splashScreenImageEl.style.left = splashScreen.imageLocation.x + "px";
        splashScreenImageEl.style.height = splashScreen.imageLocation.height + "px";
        splashScreenImageEl.style.width = splashScreen.imageLocation.width + "px";

        if (splashLoadingEl) {
            splashLoadingEl.style.top = (splashScreen.imageLocation.y + splashScreen.imageLocation.height + 20) + "px";
        }
    };


    // Module Registration
    WAT.registerModule("nav", self);

})(window.WAT, window.WinJS, window.Windows);