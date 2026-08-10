chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'toggleInspector' });
  } catch (error) {
    console.error('Не удалось связаться со страницей TrackStudio:', error);
  }
});