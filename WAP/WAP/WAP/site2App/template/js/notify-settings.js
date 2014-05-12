(function (WAT) {
    "use strict";

    var handlePageReady, handleFlyoutHide, subscriptionChanged,
        notify,
        flyoutUrl = "/template/notify-settings.html",
        logger = window.console;

    if (!WAT) {
        // This would be bad...
        logger.error("The WAT namespace is not defined!");
        return;
    }

    if (WAT.getModule("log")) {
        logger = WAT.getModule("log");
    }

    notify = WAT.getModule("notify");
    if (!notify) {
        logger.error("Unable to find notify module");
        return;
    }

    handlePageReady = function (element, options) {
        var i, l,
            templateElement = document.getElementById("notifySettingsTemplate"),
            renderElement = document.getElementById("notifySettingsTemplateControlRenderTarget"),
            templateControl = templateElement.winControl;

        // Special styling applies when a flyout is present...
        document.querySelector("body").classList.add("flyout-active");
        // Remove the special styling when flyout present
        element.querySelector(".win-settingsflyout").winControl.onafterhide = handleFlyoutHide;

        // reset inner content
        renderElement.innerHTML = "";
            
        for (i = 0, l = notify.tagSubs.length; i < l; ++i) {
            templateControl.render(notify.tagSubs[i], renderElement).then(
                function completed(result) {
                    // Get a handle to newly rendered toggle switch inside the template
                    var e = renderElement.children[i].children[0];

                    // Need to set id attribute here, wouldn't render in data-win-bind for some reason
                    e.setAttribute("id", notify.tagSubs[i].id);

                    // Add changed event handler
                    e.winControl.addEventListener('change', subscriptionChanged, false);
                }
            );
        }
    };

    handleFlyoutHide = function () {
        document.querySelector("body").classList.remove("flyout-active");
    };

    subscriptionChanged = function (event) {
        logger.log("Changed:" + event.target.winControl.title);

        // Update setting model & subscription
        notify.updateSubscription(event.target.id, event.target.winControl.checked);
    };


    // Set up the page and handlers
    WinJS.UI.Pages.define(flyoutUrl, { ready: handlePageReady });

})(window.WAT);
