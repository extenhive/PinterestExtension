document.addEventListener('DOMContentLoaded', function() {
  const downloadBtn = document.getElementById('downloadBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const status = document.getElementById('status');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const progressDiv = document.querySelector('.progress');
  const logArea = document.getElementById('logArea');
  const verifyLicenseBtn = document.getElementById('verifyLicenseBtn');
  const licenseInput = document.getElementById('licenseKeyInput');

  let licenseVerified = false;

  chrome.storage.local.get('licenseVerified', (data) => {
    if (data.licenseVerified) {
      licenseVerified = true;
      downloadBtn.disabled = false;
      verifyLicenseBtn.disabled = true;
      licenseInput.disabled = true;
      showStatus('License already verified.', 'success');
      addLog('✅ License already verified.');
    } else {
      licenseVerified = false;
      downloadBtn.disabled = false; // Allow limited download
      showStatus('License not verified. Limited to 50 pins. Email extenhive@gmail.com to purchase a license for unlimited downloads.', 'error');
      addLog('❌ License not verified. Limited download. Email extenhive@gmail.com to purchase a license for unlimited downloads.');
    }
  });
  

  // downloadBtn.addEventListener('click', handleDownload);

  downloadBtn.addEventListener('click', async () => {
    try {
      // Clear previous logs
      logArea.innerHTML = '';

          // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
      const urlPath = new URL(tab.url).pathname.split('/').filter(Boolean);

      // List of reserved Pinterest keywords (non-board pages)
      const reserved = [
        'search', 'pin', 'ideas', 'today', 'explore', 'business', 'notifications',
        'messages', 'settings', 'login', 'signup', 'password-reset', 'about'
      ];
      
      // Must be /username/boardname[/section] and username not reserved
      if (urlPath.length < 2 || reserved.includes(urlPath[0]) || reserved.includes(urlPath[1])) {
        showStatus('Please navigate to a Pinterest board first', 'error');
        return;
      }
  
      // Show progress
      progressDiv.style.display = 'block';
      downloadBtn.disabled = true;
      showStatus('Starting download...', 'success');
      addLog('🔍 Starting board download...');
  
      // Send message to content script
      chrome.tabs.sendMessage(tab.id, { action: 'startDownload' }, (response) => {
        if (response && response.error) {
          showStatus(response.error, 'error');
          addLog(`❌ Error: ${response.error}`);
        }
      });
  
    } catch (error) {
      showStatus('Error: ' + error.message, 'error');
      addLog(`❌ Error: ${error.message}`);
    }
  });
  
  cancelBtn.addEventListener('click', cancelDownload);
  verifyLicenseBtn.addEventListener('click', verifyLicense);

  function handleDownload() {
    downloadBtn.disabled = true;
    downloadBtn.textContent = "Downloading...";
    status.style.display = 'none';
    logArea.innerHTML = '';

    const shouldFetchVisitSite = document.getElementById('fetchVisitSite').checked;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { 
        action: 'startDownload',
        shouldFetchVisitSite: shouldFetchVisitSite,
        licenseVerified: licenseVerified
      });
    });

    showStatus('Starting download...', 'success');
    addLog('Starting board download...');
  }

  function cancelDownload() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'stopDownload' });
    });
    downloadBtn.disabled = false;
    downloadBtn.textContent = "Download Board";
    showStatus('Download canceled.', 'error');
    progressDiv.style.display = 'none';
    addLog('⛔ Download canceled.');
  }

  async function verifyLicense() {
    const licenseKey = licenseInput.value.trim();
    if (!licenseKey) {
      showStatus('Please enter a license key.', 'error');
      return;
    }

    showStatus('Verifying license...', 'success');

  try {
    const response = await fetch("https://extenhub.com/api/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ license_key: licenseKey })
    });
  
    const result = await response.json();
  
    if (result.valid) {
      showStatus('License verified! You can now download unlimited.', 'success');
      downloadBtn.disabled = false;
      verifyLicenseBtn.disabled = true;
      licenseInput.disabled = true;
      addLog('✅ License verified.');
      licenseVerified = true;
      chrome.storage.local.set({ licenseVerified: true });
    } else {
      showStatus('Invalid or expired license.', 'error');
      downloadBtn.disabled = false;
      licenseVerified = false;
      chrome.storage.local.set({ licenseVerified: false });
      addLog('❌ License verification failed.');
    }
  } catch (error) {
    console.error(error);
    showStatus('Error verifying license.', 'error');
    addLog(`Error: ${error.message}`);
  }
}

  
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'log') {
      addLog(message.message);
    } else if (message.type === 'progress') {
      progressDiv.style.display = 'block';
      progressBar.value = message.progress;
      progressText.textContent = `${message.progress.toFixed(1)}%`;
    } else if (message.type === 'complete') {
      showStatus('Download complete!', 'success');
      downloadBtn.disabled = false;
      downloadBtn.textContent = "Download Board";
      progressDiv.style.display = 'none';
      addLog(message.message);
    } else if (message.type === 'error') {
      showStatus(message.error, 'error');
      downloadBtn.disabled = false;
      downloadBtn.textContent = "Download Board";
      progressDiv.style.display = 'none';
      addLog(`Error: ${message.error}`);
    }
  });

  function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
  }

  function addLog(text) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = text;
    logArea.appendChild(entry);
    logArea.scrollTop = logArea.scrollHeight;
  }
});
