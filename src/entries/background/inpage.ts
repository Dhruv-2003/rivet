export async function setupInpage() {
  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts({
      ids: ['inpage'],
    })
    if (scripts.length > 0) {
      await chrome.scripting.updateContentScripts([
        {
          id: 'inpage',
          matches: ['file://*/*', 'http://*/*', 'https://*/*'],
          js: ['inpage.js'],
          runAt: 'document_start',
          world: 'MAIN',
        },
      ])
      return
    }

    await chrome.scripting.registerContentScripts([
      {
        id: 'inpage',
        matches: ['file://*/*', 'http://*/*', 'https://*/*'],
        js: ['inpage.js'],
        runAt: 'document_start',
        world: 'MAIN',
      },
    ])
  } catch (err) {
    console.warn('Failed to register inpage content script:', err)
  }
}
