// TrackStudio CyberOS Helper - Service Worker (Background Script)
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: "toggle_widget" });
  }
});
