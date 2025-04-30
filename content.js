let isDownloading = false;
const scrollDelay = 2000;
const seenThumbs = new Set();
const pinsMap = new Map();

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));


function sanitizeName(name) {
    if (!name) return 'Unknown';
  
    return name
      .replace(/[\\\/:*?"<>|]/g, '') // remove illegal characters
      .replace(/\s+/g, ' ')          // collapse multiple spaces
      .trim()                        // trim start/end spaces
      .substring(0, 100) || 'Unknown'; // cut to 100 chars max
  }
  

// ✅ Get Board and Section Name from URL
function unslugify(slug) {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

async function processPin(pin, boardName, sectionName) {
  // pin.scrollIntoView();
  const img = pin.querySelector('img');
  const thumb = img?.src;
  if (!thumb || seenThumbs.has(thumb)) return false;
  seenThumbs.add(thumb);

  const mainA = pin.querySelector('a[aria-label]');
  const raw = mainA?.getAttribute('aria-label') || '';
  const title = raw.replace(/ pin page$/i, '').trim();
  const desc = img.alt || '';
  const thumbName = thumb.split('/').pop().split('?')[0];
  const pinLink = mainA?.href || '';

  pinsMap.set(thumb, {
    title,
    description: desc,
    pinLink,
    thumbName,
    board: boardName,
    section: sectionName
  });

  return true;
}

async function fetchVisitSite(pinUrl, index, total) {
  console.log(`🔎 [${index}/${total}] Fetching Visit Site from: ${pinUrl}`);
  
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = pinUrl;
    document.body.appendChild(iframe);

    iframe.onload = async () => {
      try {
        const visitButton = iframe.contentDocument.querySelector('a[href^="http"]:not([href*="pinterest.com"])');
        const visitLink = visitButton ? visitButton.href : '';
        console.log(`✅ [${index}/${total}] Found Visit Site: ${visitLink || 'No link found'}`);
        resolve(visitLink);
      } catch (err) {
        console.error(`❌ [${index}/${total}] Failed to fetch Visit Site`, err);
        resolve('');
      } finally {
        document.body.removeChild(iframe);
      }
    };

    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch {}
      console.warn(`⏰ [${index}/${total}] Timeout fetching Visit Site`);
      resolve('');
    }, 7000);
  });
}

async function deepScroll(licenseVerified) {
  pinsMap.clear();
  seenThumbs.clear();

  let lastHeight = 0;
  let attemptsWithoutNewPins = 0;

  const urlParts = window.location.pathname.split('/').filter(Boolean);
  const username = urlParts[0] || '';
  const boardSlug = urlParts[1] || '';
  const sectionSlug = urlParts[2] || '';

  const boardName = sanitizeName(unslugify(boardSlug) || 'Pinterest_Board');
  const sectionName = sanitizeName(sectionSlug ? unslugify(sectionSlug) : '');

  chrome.runtime.sendMessage({ type: 'log', message: `📋 Board: ${boardName}, Section: ${sectionName || '(none)'}` });

  while (attemptsWithoutNewPins < 5 && isDownloading) {
    window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
    await wait(scrollDelay);

    const pins = document.querySelectorAll('div[data-test-id="max-width-container"] div[data-test-id="pin"]');
    let newPinsFound = 0;

    for (const pin of pins) {
      if (await processPin(pin, boardName, sectionName)) {
        newPinsFound++;

        if (!licenseVerified && seenThumbs.size >= 50) {
          console.log('⚡ Pin limit reached for unlicensed user (50 pins).');
          return { boardName, sectionName };
        }
      }
    }

    if (newPinsFound === 0) {
      attemptsWithoutNewPins++;
    } else {
      attemptsWithoutNewPins = 0;
    }

    const newHeight = document.body.scrollHeight;
    if (newHeight === lastHeight) {
      attemptsWithoutNewPins++;
    }
    lastHeight = newHeight;

    chrome.runtime.sendMessage({
      type: 'progress',
      progress: Math.min(50, (seenThumbs.size / 100) * 50)
    });
  }

  return { boardName, sectionName };
}


async function downloadImages(boardName, sectionName, shouldFetchVisitSite) {
  const data = [];
  const allPins = Array.from(pinsMap.entries());
  
  chrome.runtime.sendMessage({
    type: 'log',
    message: `→ Found ${pinsMap.size} pins. Fetching "Visit Site" links...`
  });

  for (let i = 0; i < allPins.length && isDownloading; i++) {
    const [thumb, meta] = allPins[i];

    let originals = thumb;
    if (thumb.includes('/236x/')) {
      originals = thumb.replace('/236x/', '/originals/');
    } else if (thumb.includes('/474x/')) {
      originals = thumb.replace('/474x/', '/originals/');
    }
    const imageName = originals.split('/').pop().split('?')[0];

    let visitSite = '';
    if (meta.pinLink && shouldFetchVisitSite) {
      visitSite = await fetchVisitSite(meta.pinLink, i + 1, allPins.length);
      await wait(1000);
    }

    data.push({
      board: meta.board,
      section: meta.section,
      title: meta.title,
      description: meta.description,
      visitSite,
      originals,
      imageName
    });

    // Update progress (50-100% for processing)
    chrome.runtime.sendMessage({
      type: 'progress',
      progress: 50 + ((i + 1) / allPins.length) * 50
    });
  }

  // Create and download CSV
  const header = ['Board','Section','Title','Description','Links','ImageName'];
  const rows = data.map(d =>
    [d.board, d.section, d.title, d.description, d.visitSite, d.imageName]
      .map(s => `"${s.replace(/"/g, '""')}"`).join(',')
  );
  const csv = header.join(',') + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  
  chrome.runtime.sendMessage({
    type: 'download',
    url: url,
    filename: `${boardName}/${sectionName || 'General'}/pins.csv`
  });

  // Download images
  for (const { originals, imageName } of data) {
    if (!isDownloading) break;
    try {
    chrome.runtime.sendMessage({
    type: 'download',
    url: originals,
    filename: `${boardName}/${sectionName || 'General'}/${imageName}`
    });
      await wait(800);
          // ⚡ EXTRA wait every 100 images
      if (i > 0 && i % 100 === 0) {
        console.log('⏳ Taking a longer pause to avoid throttling...');
        await wait(6000);  // Wait 5 seconds after every 100 downloads
      }
    } catch (err) {
      console.error('Failed to download:', originals, err);
    }
  }
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startDownload') {
    if (isDownloading) {
      sendResponse({ error: 'Download already in progress' });
      return;
    }

    isDownloading = true;
    (async () => {
      try {
        const { boardName, sectionName } = await deepScroll(request.licenseVerified);
        await downloadImages(boardName, sectionName, request.shouldFetchVisitSite, request.licenseVerified);
        chrome.runtime.sendMessage({ 
          type: 'complete',
          message: `✅ Done! Downloaded ${pinsMap.size} images and generated full pins.csv with Board + Section from URL.`
        });
      } catch (error) {
        chrome.runtime.sendMessage({ 
          type: 'error', 
          error: error.message 
        });
      } finally {
        isDownloading = false;
      }
    })();
  } else if (request.action === 'stopDownload') {
    isDownloading = false;
  }
});
