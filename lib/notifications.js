(function initNotifications(globalScope) {
  const root = globalScope.AvtoFair = globalScope.AvtoFair || {};
  const { Utils } = root;

  function shouldNotifyPriceDrop(item, previousPrice, nextPrice) {
    if (!item || previousPrice === null || nextPrice === null) {
      return false;
    }

    if (nextPrice >= previousPrice) {
      return false;
    }

    const lastNotified = item.notificationState
      && item.notificationState.lastNotifiedPriceDropTo !== undefined
      && item.notificationState.lastNotifiedPriceDropTo !== null
      ? item.notificationState.lastNotifiedPriceDropTo
      : null;
    return lastNotified === null || nextPrice < lastNotified;
  }

  function buildNotificationId(item) {
    return `avtofair-drop-${item.id}`;
  }

  function createPriceDropNotification(item, previousPrice, nextPrice) {
    return new Promise((resolve) => {
      chrome.notifications.create(buildNotificationId(item), {
        type: "basic",
        iconUrl: "assets/logo.svg",
        title: `${item.title} dropped in price`,
        message: `${Utils.formatPrice(previousPrice, item.currency)} -> ${Utils.formatPrice(nextPrice, item.currency)}`,
        priority: 1
      }, resolve);
    });
  }

  root.Notifications = {
    shouldNotifyPriceDrop,
    buildNotificationId,
    createPriceDropNotification
  };
}(globalThis));
