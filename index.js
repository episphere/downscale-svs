
import imagebox3 from "https://episphere.github.io/imagebox3/imagebox3.mjs";
// import imagebox3 from "http://localhost:8081/imagebox3.mjs";
const lowerThreshold = 150;
const upperThreshold = 230;
const FILENAME_FIELD_IN_LABELS_CSV = "HALO_image_link"
const LABEL_FIELD_IN_LABELS_CSV = "cat1"
const MOBILE_NET_INPUT_WIDTH = 224;
const MOBILE_NET_INPUT_HEIGHT = 224;

let database = []
let databaseX = []
let databaseY = []
let globalKeys = []
// let samples = []
// let labels = []
let fileNames = new Set()
let numPresses = 0

const gcsUploadAPIPath = "https://us-east4-dl-test-tma.cloudfunctions.net/gcs-upload"
const gcsFolderName = "test-folder"

const automlAPIPath = "https://us-central1-dl-test-tma.cloudfunctions.net/setupAutoML"

const initialize = () => {
    epibox.ini();
    if(!localStorage.epiBoxToken) return;
    radioHandler();
    displaySliderValue();
    getFolderIds();
}

const radioHandler = () => {
    const radioButtons = Array.from(document.getElementsByName('extractTiles'));
    radioButtons.forEach(radioButton => {
        radioButton.addEventListener('change', () => {
            const value = radioButton.value;
            const tileRangeSelector = document.getElementById('tileRangeSelector');
            if(value === 'randomTiles') {
                tileRangeSelector.innerHTML = `
                    
                    <div class="new-line">
                        Tiles to extract: <input type="number" id="noOfTiles" min="4" max="20" value="4">
                    </div>
                    <div class="new-line mr-top-10">
                        Magnification level: <input type="number" id="magnificationLevel" step="2" min="6" max="60" value="10"> x
                    </div>
                    
                `;
                tileRangeSelector.classList.remove('slidecontainer')
            }
            else {
                tileRangeSelector.classList.add('slidecontainer')
                tileRangeSelector.innerHTML = `
                                    <input type="range" min="0" max="96" value="8" step="8" class="slider" id="myRange">
                                    <span id="sliderValue">8 tiles</span>`;
                displaySliderValue();
            }
        });
    });

}

const displaySliderValue = () => {
    const myRange = document.getElementById("myRange");
    if(!myRange) return;
    myRange.addEventListener('input', () => {
        const value = myRange.value === '0' ? 'whole image' : myRange.value+' tiles';
        document.getElementById('sliderValue').innerHTML = value;
    });
}

const magnificationLevel = {
    8: {
        rows: 2,
        cols: 4
    },
    16: {
        rows: 4,
        cols: 4
    },
    24: {
        rows: 4,
        cols: 6
    },
    32: {
        rows: 4,
        cols: 8
    },
    40: {
        rows: 5,
        cols: 8
    },
    48: {
        rows: 6,
        cols: 8
    },
    56: {
        rows: 7,
        cols: 8
    },
    64: {
        rows: 8,
        cols: 8
    },
    72: {
        rows: 8,
        cols: 9
    },
    80: {
        rows: 8,
        cols: 10
    },
    88: {
        rows: 8,
        cols: 11
    },
    96: {
        rows: 8,
        cols: 12
    }
}

const getFolderIds = () => {
    const form = document.getElementById('folderIds');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const inputFolderId = document.getElementById('inputFolderId').value;
        const labelsFile = document.getElementById('inputLabelsCSV').value;
        const accessToken = JSON.parse(localStorage.epiBoxToken).access_token;
        let items = await getFolderItems(accessToken, inputFolderId);
        renderFileSelection(items.entries, accessToken);
        if (labelsFile) {
            localStorage.labels = getLabels(labelsFile, items.entries)
        }
    })
    
}

const getLabels = async (labelsFile, entries) => {
    const response = await getFileContent(JSON.parse(localStorage.epiBoxToken).access_token, labelsFile);
    const labels = await response.text();
    const csvRows = labels.split('\n').map(row => row.trim().split(','));
    
    const keyIndices = {}
    const keys = csvRows.splice(0, 1)[0]
    keyIndices[FILENAME_FIELD_IN_LABELS_CSV] = keys.indexOf(FILENAME_FIELD_IN_LABELS_CSV);
    keyIndices[LABEL_FIELD_IN_LABELS_CSV] = keys.indexOf(LABEL_FIELD_IN_LABELS_CSV);
    
    const labelsObject = entries.reduce((obj, {id, name: filename}) => {
        const csvRow = csvRows.find(row => row[keyIndices[FILENAME_FIELD_IN_LABELS_CSV]].trim().includes(filename));
        const rowObj = {}
        rowObj['fileID'] = id;
        rowObj['filename'] = filename;
        rowObj['label'] = csvRow[keyIndices[LABEL_FIELD_IN_LABELS_CSV]] === "POT1" ? "POT1" : "Non-POT1";
        obj.push(rowObj)
        return obj
    }, [])

    const idbOpenReq = window.indexedDB.open("labels", 1)
    idbOpenReq.onupgradeneeded = (evt) => {
        const db = evt.target.result;
        if (!db.objectStoreNames.contains("labels")) {
            db.createObjectStore("labels", { keyPath: "fileID" });
        }
    }

    idbOpenReq.onsuccess = (evt) => {
        const db = evt.target.result;
        const tx = db.transaction("labels", "readwrite");
        const store = tx.objectStore("labels");
        store.clear();
        labelsObject.forEach(label => {
            store.add(label);
        })
    }

    return JSON.stringify(labelsObject)
}

const getDownloadURL = async (accessToken, fileId) => {
    const controller = new AbortController()
    const signal = controller.signal
    const { url } = await getFileContent(accessToken, fileId, signal)
    controller.abort();
    return url;
}

const renderFileSelection = (files, accessToken) => {
    const div = document.getElementById('fileSelectionDiv');
    div.innerHTML = '';
    const select = document.createElement('select');
    select.id = 'fileSelection';
    
    files.forEach((file, index) => {
        if (file.name.endsWith(".svs")) {
            const option = document.createElement('option');
            option.value = file.id;
            option.innerText = file.name;
            if(index === 0) option.selected = true;
            select.appendChild(option);
        }
    });
    div.appendChild(select);
    tileHandle(accessToken, select.value, files);
    onFileSelectionChange(accessToken, files);
}

const onFileSelectionChange = (accessToken, files) => {
    const select = document.getElementById('fileSelection');
    select.addEventListener('change', () => {
        const loaderDiv = document.createElement('div');
        loaderDiv.id = 'loaderDiv';
        loaderDiv.classList = 'row';
        loaderDiv.innerHTML += '<div class="loader"></div>';
        document.body.appendChild(loaderDiv);
        const fileId = select.value;
        tileHandle(accessToken, fileId, files)
    })
    
}

const tileHandle = async (accessToken, fileId, files) => {
    if(document.getElementById('uploadImageButon')) document.getElementById('uploadImageButon').remove();
    if(document.getElementById('thumbnailDiv')) document.getElementById('thumbnailDiv').remove();
    if(document.getElementById('imageDiv')) document.getElementById('imageDiv').remove();
    if(document.getElementById('loaderDiv')) document.getElementById('loaderDiv').remove();
    const loaderDiv = document.createElement('div');
    loaderDiv.id = 'loaderDiv';
    loaderDiv.classList = 'row';
    loaderDiv.innerHTML += '<div class="loader"></div>';
    document.body.appendChild(loaderDiv);
    const fileName = files.filter(dt => dt.id === fileId)[0].name;
    const imageURL = await getDownloadURL(accessToken, fileId);
    let imageInfo = null;
    imageInfo = await (await imagebox3.getImageInfo(imageURL)).json();
    renderTileThumbnail(imageInfo, imageURL, fileName, fileId);
}

const getFileContent = async (accessToken, fileId, signal) => {
    const response = await fetch(`https://api.box.com/2.0/files/${fileId}/content`,{
        method:'GET',
        signal,
        headers:{
            Authorization:"Bearer "+accessToken
        }
    });
    return response;
}

const getFolderItems = async (accessToken, folderId) => {
    const response = await fetch(`https://api.box.com/2.0/folders/${folderId}/items?limit=1000`,{
        method:'GET',
        headers:{
            Authorization:"Bearer "+accessToken
        }
    })
    return response.json();
}

const renderTileThumbnail = async (imageInfo, imageURL, imageName, fileId) => {
    let magnification = null;
    if(document.getElementById("myRange")) magnification = document.getElementById("myRange").value;
    if(document.getElementById('loaderDiv')) document.getElementById('loaderDiv').remove();

    const thumbnailDiv = document.createElement('div');
    thumbnailDiv.id = 'thumbnailDiv';
    thumbnailDiv.classList = 'row';
    document.body.appendChild(thumbnailDiv);
    
    const div = document.createElement('div');
    div.id = 'uploadImageButon'
    div.classList = 'mr-bottom-10';
    div.innerHTML = `<button id="uploadImage">Upload to: </button> <select id="cloudSelect"><option>Google Cloud Storage</option><option disabled>Box</option></select><button id="startAutoMLBtn" disabled>Start AutoML training</button>`;
    thumbnailDiv.appendChild(div);
    const canvases = Array.from(document.getElementsByClassName('uploadCanvas'));
    canvases.forEach(canvas => {
        canvas.remove();
    });

    if(!magnification) {
        const dimension = 512;
        const magnificationLevel = document.getElementById('magnificationLevel').value;
        const imageDiv = document.createElement('div');
        imageDiv.classList = 'row';
        imageDiv.id = 'imageDiv';
        const blob = await (await imagebox3.getImageThumbnail(imageURL, {thumbnailWidthToRender: dimension})).blob();
        const [desiredCoordinates, imgWidth, imgHeight] = await getWholeSlidePixelData(blob, dimension, imageDiv, imageInfo);
        document.body.appendChild(imageDiv);

        for(let i = 0; i < desiredCoordinates.length; i++) {
            let x = desiredCoordinates[i][0];   
            let y = desiredCoordinates[i][1];
            x = x * Math.floor(imageInfo.width / imgWidth);
            y = y * Math.floor(imageInfo.height / imgHeight);
            const scaledWidth = Math.floor(imageInfo.width/magnificationLevel);
            const scaledHeight = Math.floor(imageInfo.height/magnificationLevel);
            x = x - Math.floor(scaledWidth / 2);
            y = y - Math.floor(scaledHeight / 2);
            const fileName = imageName.replaceAll(".", "_") + `_${x}_${y}_${Math.max(scaledWidth, scaledHeight)}_1024_${magnificationLevel}_${i+1}.jpg`;
            const canvas = await extractRandomTile([x, y], scaledWidth, scaledHeight, imageURL, imageDiv, fileName, fileId);
            addEvents(canvas);
            addToDatabase(canvas)
        }
        handleImageUpload(imageDiv);
    }
    else if(magnification === '0') {
        const blob = await (await imagebox3.getImageThumbnail(imageURL, {thumbnailWidthToRender: 512})).blob();
        const fileName = imageName.substring(0, imageName.lastIndexOf('.'))+'.jpg';
        canvasHandler(blob, fileName, 512, thumbnailDiv, false);
        handleImageUpload(thumbnailDiv);
    }
    else {
        const rows = magnificationLevel[magnification].rows;
        const cols = magnificationLevel[magnification].cols;
        const imageDiv = document.createElement('div');
        imageDiv.classList = 'row';
        imageDiv.id = 'imageDiv';
        imageDiv.style.width = `${138*cols}px`;
        imageDiv.style.height = `${138*rows}px`;
        document.body.appendChild(imageDiv);
        const xys = generateXYs(rows, cols, imageInfo.height, imageInfo.width);
        let heightIncrements = Math.floor(imageInfo.height / rows);
        let widthIncrements = Math.floor(imageInfo.width / cols);
        
        for(let i = 0; i < xys.length; i++) {
            let [x, y] = xys[i];
            let tileParams = {
                tileSize: 512,
                tileX: x,
                tileY: y,
                tileWidth: widthIncrements,
                tileHeight: heightIncrements
            };
            const tileBlob = await (await imagebox3.getImageTile(imageURL, tileParams)).blob();
            const fileName = imageName.substring(0, imageName.lastIndexOf('.'))+'_' +(i+1)+'.jpg';
            const canvas = await canvasHandler(tileBlob, fileName, tileParams.tileSize, imageDiv, true);
            addEvents(canvas);
        }
        handleImageUpload(imageDiv);
    }
}

const getPixelsWithTissue = (array) => {
    array = Array.from(array);
    const allPixels = [];
    const pixelsWithTissue = [];
    let pixelCounter = 0;
    for(let i = 0; i < array.length; i += 4) {
        const red = array[i];
        const green = array[i+1];
        const blue = array[i+2];
        const pixelArray = [red, green, blue, pixelCounter];
        allPixels.push(pixelArray);
        if(red < upperThreshold && green < upperThreshold && blue < upperThreshold) 
            pixelsWithTissue.push(pixelArray);
        pixelCounter++;
    }
    return pixelsWithTissue;
}

const getRandomPixels = (pixelsWithTissue, dimension) => {
    const random = Math.floor(Math.random() * pixelsWithTissue.length);
    const randomPixel = pixelsWithTissue[random];
    const desiredX = randomPixel[3] % dimension;
    const desiredY = Math.floor(randomPixel[3] / dimension);

    return [desiredX, desiredY];
}

const canvasHandler = (blob, fileName, desiredResolution, thumbnailDiv, smallerImage, imageURL) => {
    return new Promise((resolve, reject) => {
        let maxResolution = 512;
        const response = URL.createObjectURL(blob);
        
        const img = new Image();
        img.src = response;
    
        img.onload = () => {
            maxResolution = Math.max(img.width, img.height);
            const canvas = document.createElement('canvas');
            let ratio = maxResolution / desiredResolution;
            canvas.width = desiredResolution;
            canvas.height = desiredResolution;
            const ctx = canvas.getContext('2d');
            let x = img.width === maxResolution ? 0 : Math.floor(Math.abs(desiredResolution - img.width / ratio) * 0.5);
            let y = img.height === maxResolution ? 0 : Math.floor(Math.abs(desiredResolution - img.height / ratio) * 0.5);
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, desiredResolution, desiredResolution);
            ctx.drawImage(img, 0, 0, maxResolution, maxResolution, x, y, desiredResolution, desiredResolution);

            const imageData = ctx.getImageData(0, 0, desiredResolution, desiredResolution).data;
    
            const blockSize = 5;
            const  rgb = {r:0,g:0,b:0}
            let count = 0;
            let i = -4;
            while ((i += blockSize * 4) < imageData.length ) {
                ++count;
                rgb.r += imageData[i];
                rgb.g += imageData[i+1];
                rgb.b += imageData[i+2];
            }
            const avgRed = Math.floor(rgb.r / count);
            const avgGreen = Math.floor(rgb.g / count);
            const avgBlue = Math.floor(rgb.b / count);
    
            canvas.dataset.fileName = fileName;
            canvas.classList.add('uploadCanvas');
            
            if(avgBlue < upperThreshold && avgGreen < upperThreshold && avgRed < upperThreshold) {
                canvas.classList.add('tile-thumbnail-selected');
                const selectedTiles = Array.from(document.querySelectorAll('.tile-thumbnail-selected'));
                if(selectedTiles.length > 0) document.getElementById('uploadImage').innerHTML = `Upload ${selectedTiles.length + 1} tile(s) to: `;
            }
    
            if(smallerImage) canvas.classList.add("tile-thumbnail")
            else canvas.classList.add('whole-image');
            thumbnailDiv.appendChild(canvas);
            resolve(canvas);
        }
        
    })
    
}

const getWholeSlidePixelData = (blob, desiredResolution, imageDiv, imageInfo) => {
    return new Promise((resolve, reject) => {
        let maxResolution = 512;
        const response = URL.createObjectURL(blob);
        
        const img = new Image();
        img.src = response;
    
        img.onload = () => {
            maxResolution = Math.max(img.width, img.height);
            const canvas = document.createElement('canvas');
            canvas.classList.add("imageThumbnail")
            let ratio = maxResolution / desiredResolution;
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            let x = img.width === maxResolution ? 0 : Math.floor(Math.abs(desiredResolution - img.width / ratio) * 0.5);
            let y = img.height === maxResolution ? 0 : Math.floor(Math.abs(desiredResolution - img.height / ratio) * 0.5);
            
            // ctx.fillStyle = 'white';
            // ctx.fillRect(0, 0, desiredResolution, desiredResolution);
            // ctx.drawImage(img, 0, 0, maxResolution, maxResolution, x, y, desiredResolution, desiredResolution);
            // canvas.classList.add('whole-image');
            ctx.drawImage(img, 0, 0, img.width, img.height);
            imageDiv.appendChild(canvas);
            const br = document.createElement('br');
            imageDiv.appendChild(br);
            const imageData = ctx.getImageData(0, 0, img.width, img.height).data;
            const tiles = document.getElementById('noOfTiles').value;
            const desiredCoordinates = [];
            const pixelsWithTissue = getPixelsWithTissue(imageData);

            for(let i = 0; i < pixelsWithTissue.length; i++) {
                const pixelX = pixelsWithTissue[i][3] % desiredResolution;
                const pixelY = Math.floor(pixelsWithTissue[i][3] / desiredResolution);
                ctx.beginPath();
                ctx.arc(pixelX, pixelY, 1, 0, 1 * Math.PI);
                ctx.strokeStyle = 'rgba(109, 222, 117, 0.3)';
                ctx.stroke();
            }
            
            const magnification = document.getElementById('magnificationLevel').value;
            const rectSize = Math.min(Math.floor(img.width / magnification), Math.floor(img.height / magnification));
            const buffer = Math.floor(rectSize / 2);
            let lowerX = 30;
            let lowerY = 30;
            let upperX = img.width - 30;
            let upperY = img.height - 30;
            
            for(let i = 0; i < tiles; i++) {
                let isValid = false;
                while(!isValid) {  
                    let [tileX, tileY] = getRandomPixels(pixelsWithTissue, desiredResolution);
                    if(tileX < lowerX || tileX > upperX || tileY < lowerY || tileY > upperY) continue;
                    
                    tileX = tileX - buffer;
                    tileY = tileY - buffer;
                    
                    ctx.rect(tileX, tileY, rectSize, rectSize);
                    ctx.strokeStyle = 'red';
                    ctx.stroke();
                    desiredCoordinates.push([tileX, tileY]);
                    isValid = true;
                }
            }
            resolve([desiredCoordinates, img.width, img.height]);
        }
    })
    
}

const extractRandomTile = async ([tilex, tiley], widthIncrements, heightIncrements, imageURL, imageDiv, fileName, fileId) => {
    return new Promise(async (resolve, reject) => {
        let tileParams = {
            tileSize: 256,
            tileX: tilex,
            tileY: tiley,
            tileWidth: Math.max(widthIncrements, heightIncrements),
            tileHeight: Math.max(widthIncrements, heightIncrements)
        };
        const blob = await (await imagebox3.getImageTile(imageURL, tileParams)).blob();
    
        let maxResolution = 256;
        const response = URL.createObjectURL(blob);
        
        const img = new Image();
        img.src = response;
    
        img.onload = () => {
            let desiredResolution = 256;
            maxResolution = Math.max(img.width, img.height);
            const tileContainer = document.createElement('div');
            tileContainer.classList.add('tileContainer');
            const canvas = document.createElement('canvas');
            let ratio = maxResolution / desiredResolution;
            canvas.width = desiredResolution;
            canvas.height = desiredResolution;
            const ctx = canvas.getContext('2d');
            let x = img.width === maxResolution ? 0 : Math.floor(Math.abs(desiredResolution - img.width / ratio) * 0.5);
            let y = img.height === maxResolution ? 0 : Math.floor(Math.abs(desiredResolution - img.height / ratio) * 0.5);
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, desiredResolution, desiredResolution);
            ctx.drawImage(img, 0, 0, maxResolution, maxResolution, x, y, desiredResolution, desiredResolution);

            const imageData = ctx.getImageData(0, 0, desiredResolution, desiredResolution).data;
            
            const blockSize = 5;
            const  rgb = {r:0,g:0,b:0}
            let count = 0;
            let i = -4;
            while ((i += blockSize * 4) < imageData.length ) {
                ++count;
                rgb.r += imageData[i];
                rgb.g += imageData[i+1];
                rgb.b += imageData[i+2];
            }
            const avgRed = Math.floor(rgb.r / count);
            const avgGreen = Math.floor(rgb.g / count);
            const avgBlue = Math.floor(rgb.b / count);
            if(avgBlue < upperThreshold && avgGreen < upperThreshold && avgRed < upperThreshold && avgBlue > lowerThreshold && avgGreen > lowerThreshold && avgRed > lowerThreshold) {
                canvas.classList.add('tile-thumbnail-selected');
                const selectedTiles = Array.from(document.querySelectorAll('.tile-thumbnail-selected'));
                if(selectedTiles.length > 0) document.getElementById('uploadImage').innerHTML = `Upload ${selectedTiles.length + 1} tile(s) to:`;
            }
            canvas.dataset.fileName = fileName;
            canvas.classList.add('uploadCanvas');
            canvas.classList.add("tile-thumbnail");
            Object.entries(tileParams).forEach(([key, value]) => {
                canvas.dataset[key] = value;
            });
            tileContainer.appendChild(canvas);
            
            const label = document.createElement('label');
            const idbOpenReq = window.indexedDB.open('labels', 1);
            idbOpenReq.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction(['labels'], 'readwrite');
                const objectStore = transaction.objectStore('labels');
                const getReq = objectStore.get(fileId);
                getReq.onsuccess = (event) => {
                    const { label: tileLabel } = event.target.result;
                    label.innerHTML = `Label: ${tileLabel}`;
                    canvas.dataset.label = tileLabel
                }
            }
            
            tileContainer.appendChild(document.createElement('br'));
            tileContainer.appendChild(label);
            imageDiv.appendChild(tileContainer);
            resolve(canvas)
        }

    })
}

const addEvents = async (canvas) => {
    // const canvases = Array.from(document.querySelectorAll('canvas.uploadCanvas'));
    // canvases.forEach(canvas => {
    canvas.addEventListener('click', e => {
        e.stopPropagation();
        if(canvas.classList.contains('tile-thumbnail-selected')) {
            canvas.classList.remove('tile-thumbnail-selected');
        }
        else {
            canvas.classList.add('tile-thumbnail-selected');
            addToDatabase(canvas)
        }

        const selectedTiles = Array.from(document.querySelectorAll('.tile-thumbnail-selected'));
        if(selectedTiles.length > 0)
            document.getElementById('uploadImage').innerHTML = `Upload ${selectedTiles.length} tile(s) to:`;
        else
            document.getElementById('uploadImage').innerHTML = `Upload all tiles to:`;
    });
    // });
}

const generateXYs = (rows, cols, height, width) => {
    let xys = [];
    let r = 0;
    const heightIncrements = Math.floor(height/rows);
    const widthIncrements = Math.floor(width/cols);
    while(r < rows) {
      let c = 0;
      while(c < cols) {
        xys.push([c === 0 ? 1 : c * widthIncrements, r === 0 ? 1 : r * heightIncrements]);
        c++
      }
      r++
    }
    return xys
}

const handleImageUpload = async (thumbnailDiv, destCloud="gcs") => {
    const uploadBtn = document.getElementById('uploadImage');
    
    uploadBtn.addEventListener('click', async () => {
        const accessToken = JSON.parse(localStorage.epiBoxToken).access_token;
        let canvases;
        const selectedTiles = Array.from(document.querySelectorAll('.tile-thumbnail-selected'));
        if(selectedTiles.length > 0)
            canvases = selectedTiles;
        else
            canvases = Array.from(document.getElementsByClassName('uploadCanvas'));
        
        for (let c=0; c<canvases.length; c++) {
            let fileName = canvases[c].dataset.fileName;
            // canvases[c].toBlob(async (blob) => {
            const tileParams = {
                'tileX': canvases[c].dataset.tileX,
                'tileY': canvases[c].dataset.tileY,
                'tileWidth': canvases[c].dataset.tileWidth,
                'tileHeight': canvases[c].dataset.tileHeight,
                'tileSize': 1024
            }
            const select = document.getElementById('fileSelection');
            const imageURL = await getDownloadURL(accessToken, select.value)
            const blob = await (await imagebox3.getImageTile(imageURL, tileParams)).blob();

            let message = '';
            if (destCloud === "box") {
                const outputFolderId = document.getElementById('outputFolderId').value;
                const image = new File([blob], fileName, { type: blob.type });
                const formData = new FormData();
                formData.append('file', image);
                formData.append('attributes', `{"name": "${fileName}", "parent": {"id": "${outputFolderId}"}}`);
                let response = await uploadFileToBox(accessToken, formData);
                if(response.status === 201)
                    message = `${fileName} uploaded successfully</span>`;
                if(response.status === 409) {
                    const json = await response.json();
                    const existingFileId = json.context_info.conflicts.id;
                    uploadNewVersion(accessToken, existingFileId, formData);
                    message = `${fileName} uploaded new version</span>`;
                }
            } else if (destCloud === "gcs") {
                const gcsFilePath = await uploadFileToGCS(accessToken, fileName, blob, "image/jpeg")
                message = `${fileName} uploaded successfully</span>`;
                await updateLabelsCSV(gcsFilePath, canvases[c].dataset.label);
            }
            const p = document.createElement('p');
            p.innerHTML = `<span class="success">${message}</span>`;
            thumbnailDiv.appendChild(p);
            // }, 'image/jpeg', 1);
        }
        
    })

    const startAutoMLBtn = document.getElementById('startAutoMLBtn');
    startAutoMLBtn.addEventListener('click', startAutoMLTraining);
}

const uploadFileToBox = async (accessToken, formData) => {
    const response = await fetch("https://upload.box.com/api/2.0/files/content", {
        method: "POST",
        headers:{
            Authorization:"Bearer "+accessToken
        },
        body: formData,
        contentType: false
    });
    return response;
}

const uploadFileToGCS = async (accessToken, filename, content, mimeType="image/jpeg") => {
    let getSignedURL = async () => {
        const { id: userID } = await epibox.getUser()
        const resp = await (await fetch(`${gcsUploadAPIPath}?fileName=${gcsFolderName}_${userID}/${filename}&at=${accessToken}`)).json()
        return resp
    }

    const { url: signedURL, filePath } = await getSignedURL()
    await fetch(signedURL, {
        method: "PUT",
        headers: {
            'Content-Type': mimeType
        },
        body: content
    })

    return filePath
}

const updateLabelsCSV = async(gcsFilePath, label) => {
    window.localStorage.labelsForAutoML = window.localStorage.labelsForAutoML ? window.localStorage.labelsForAutoML : "set,image_path,label"
    const randVar = Math.random()
    const set = randVar > 0.87 ? "TEST" : (randVar > 0.75 ? "VALIDATION" : "TRAIN")
    const { id: userID } = await epibox.getUser()
    window.localStorage.labelsForAutoML += `\n${set},${gcsFilePath},${label}`
    if(window.localStorage.labelsForAutoML.split("\n").length > 50) {
        const labelsForAutoML = window.localStorage.labelsForAutoML.split("\n")
        const labelsForAutoMLCounts = labelsForAutoML.slice(1).reduce((obj, curr) => {
            const row = curr.split(",")
            obj[row[row.length - 1]] = obj[row[row.length - 1]] ? obj[row[row.length - 1]] + 1 : 1
            return obj
        }, {})
        if (Object.values(labelsForAutoMLCounts).length >= 2 && Object.values(labelsForAutoMLCounts).every(count => count > 10)) {
            const startAutoMLButton = document.getElementById('startAutoMLBtn')
            startAutoMLButton.removeAttribute("disabled")
        }
    }
}

const startAutoMLTraining = async () => {
    const startAutoMLButton = document.getElementById('startAutoMLBtn')
    startAutoMLButton.setAttribute("disabled", "true")
    const accessToken = JSON.parse(window.localStorage.epiBoxToken).access_token
    const csvFilePath = await uploadFileToGCS(accessToken, "dataset.csv", window.localStorage.labelsForAutoML, "text/csv")
    await fetch(`${automlAPIPath}?csvFilePath=${csvFilePath}&at=${accessToken}`)
}

const uploadNewVersion = async (accessToken, fileId, formData) => {
    const response = await fetch(`https://upload.box.com/api/2.0/files/${fileId}/content`, {
        method: "POST",
        headers:{
            Authorization:"Bearer "+accessToken
        },
        body: formData,
        contentType: false
    });
}

async function addToDatabase(canvas) {
    // const tileSizeForModeling = MOBILE_NET_INPUT_WIDTH
    // let X = document.getElementsByClassName('tile-thumbnail-selected uploadCanvas tile-thumbnail') || null;
    // const accessToken = JSON.parse(localStorage.epiBoxToken).access_token;
    // console.log('Starting Tile Loading...')
    // for (let i = 0; i < X.length; i++) {
    //     const tileParams = {
    //         'tileX': X[i].dataset.tileX,
    //         'tileY': X[i].dataset.tileY,
    //         'tileWidth': X[i].dataset.tileWidth,
    //         'tileHeight': X[i].dataset.tileHeight,
    //         'tileSize': MOBILE_NET_INPUT_WIDTH
    //     }
    //     const select = document.getElementById('fileSelection');
    //     const imageURL = await getDownloadURL(accessToken, select.value)
    //     const blob = await (await imagebox3.getImageTile(imageURL, tileParams)).blob();

    //     var reader = new FileReader()
    //     reader.readAsDataURL(blob);
    //     reader.onloadend = function () {
    //         var base64String = reader.result;
    //         localforage.setItem(X[i].getAttribute('data-file-name'), {
    //             'data-label': X[i].getAttribute('data-label'),
    //             'base64': base64String
    //         })
    //     }
    //     console.log(`Image ${i+1} loaded of ${X.length}`)
    // }
    if (canvas.classList.contains("tile-thumbnail-selected")) {
        canvas.toBlob((blob) => {
            // const url = window.URL.createObjectURL(blob)
            const reader = new FileReader()
            reader.readAsDataURL(blob);
            reader.onloadend = function () {
                var base64String = reader.result;
                localforage.setItem(canvas.getAttribute('data-file-name'), {
                    'data-label': canvas.getAttribute('data-label'),
                    'base64': base64String
                })
            }
            // console.log(`Image ${i+1} loaded of ${X.length}`)
        })
    }
    
}

function getModel() { 
    let model = tf.sequential();
    const IMAGE_WIDTH = 512; 
    const IMAGE_HEIGHT = 512; 
    const IMAGE_CHANNELS = 3;

    model.add(tf.layers.conv2d({inputShape: [IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_CHANNELS],
        kernelSize: 3, filters: 8, activation:'relu'}));
    //model.add(tf.layers.conv2d({kernelSize: 3, filters: 16, activation: 'relu'}))
    model.add(tf.layers.maxPooling2d({poolSize: [2,2]}))
    model.add(tf.layers.conv2d({kernelSize: 3, filters: 32, activation: 'relu'}))
    model.add(tf.layers.maxPooling2d({poolSize: [2,2]}))
    model.add(tf.layers.conv2d({kernelSize: 3, filters: 64, activation: 'relu'}))
    model.add(tf.layers.maxPooling2d({poolSize: [2,2]}))
    model.add(tf.layers.conv2d({kernelSize: 3, filters: 128, activation: 'relu'}))
    model.add(tf.layers.maxPooling2d({poolSize: [2,2]}))
    model.add(tf.layers. flatten({}));
    model.add(tf.layers.dense({units: 1, activation:'sigmoid'}));

    
    
    model.compile({
        optimizer: 'adam',
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
    })

    return model;
}


 async function imageToTensorMobile(URL) {
    return new Promise((resolve, reject) => {
        let image = new Image();
        image.src = URL
        image.width = MOBILE_NET_INPUT_WIDTH;
        image.height = MOBILE_NET_INPUT_HEIGHT;
        image.onload = () => {
            tf.tidy(() => {
                let tensor = tf.cast(tf.browser.fromPixels(image), 'float32');
                let flippedTensor = tf.reverse(tensor)
                databaseX.push(tf.cast(flippedTensor, 'float32'))
                resolve(databaseX.push(tf.cast(tensor, 'float32')))
            })
        }
       
    })
 }

function imageToTensor(URL) {
    return new Promise((resolve, reject) => {
        let image = new Image();
        image.src = URL
        image.onload = () => {
            let tensor = tf.browser.fromPixels(image);
            resolve(databaseX.push(tensor))
        }
    })

 }

 function addFromIndexDb() {
    return new Promise ( (resolve, reject) => {
        localforage.keys()
        .then((keys) => {
        resolve(globalKeys.push(...keys))
    })
    })
 }


// Source: https://codelabs.developers.google.com/tensorflowjs-transfer-learning-teachable-machine
// Loads the Mobile Net model
 async function loadMobileNetFeatureModel() {
    const URL = 
      'https://tfhub.dev/google/tfjs-model/imagenet/mobilenet_v3_small_100_224/feature_vector/5/default/1';
    
    let mobilenet = await tf.loadGraphModel(URL, {fromTFHub: true});
    console.log('MobileNet successfully loaded')

    tf.tidy(function () {
      let answer = mobilenet.predict(tf.zeros([1, MOBILE_NET_INPUT_HEIGHT, MOBILE_NET_INPUT_WIDTH, 3]));
      console.log(answer.shape);
    });

    return mobilenet;
  }

// Source: https://www.geeksforgeeks.org/how-to-shuffle-an-array-using-javascript/
function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
    
        // Generate random number
        var j = Math.floor(Math.random() * (i + 1));
                    
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }        
    return array;
 }


var buttonMobile = document.getElementById('mobile');

buttonMobile.onclick = async function () {
    numPresses = numPresses + 1;
    await addFromIndexDb();

    globalKeys = shuffleArray(globalKeys)

    for (let i = 0; i < globalKeys.length; i++) {
        let res = await localforage.getItem(globalKeys[i])
        if (!fileNames.has(globalKeys[i]) || numPresses <= 1) {
            if (res['data-label'] === "POT1"){
                databaseY.push(1)
                databaseY.push(1)
            } else {
                databaseY.push(0)
                databaseY.push(0)
            }
            await imageToTensorMobile(res['base64'])
        }
    }

    await localforage.iterate(function (value, key, iterationNumber) {
        fileNames.add(key)
     })

    console.log(databaseX)
    console.log(databaseX[0].print())
    console.log(databaseY)

    let sum = databaseY.reduce((pSum, a) => pSum + a, 0)
    alert(`The database you created has ${databaseY.length} elements,
    ${sum} elements belonging to POT1, and ${databaseY.length-sum} belonging to NON-POT1`)

    const samples = await tf.stack(databaseX)
    const labels = await tf.stack(databaseY)

    console.log(samples.shape)
    console.log(labels.shape)

    
    let featureModel = await loadMobileNetFeatureModel();
    let predictFeatures = featureModel.predict(samples)
    tf.dispose(samples)
    tf.dispose(databaseX)

    // Adding additional layers for transfer learning
    let model = tf.sequential();
    model.add(tf.layers.dense({inputShape: [1024], units: 128, activation: 'relu'}));
    // model.add(tf.layers.dropout(0.5))
    // model.add(tf.layers.gaussianNoise(0.2))
    // model.add(tf.layers.dense({units: 300, activation: 'relu'}, ));
    // model.add(tf.layers.dropout(0.5))
    // model.add(tf.layers.dense({units: 128, activation: 'relu'}, ));
    // model.add(tf.layers.dense({units: 128, activation: 'relu'}, ));
    // model.add(tf.layers.dropout(0.2))
    // model.add(tf.layers.dense({units: 128, activation: 'relu'}, ));
    // model.add(tf.layers.dense({units: 128, activation: 'relu'}, ));
    // model.add(tf.layers.dense({units: 128, activation: 'relu'}, ));
    // model.add(tf.layers.dense({units: 128, activation: 'relu'}, ));
    // model.add(tf.layers.dropout(0.2))
    // model.add(tf.layers.dense({units: 64, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dense({units: 64, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dropout(0.2))
    // model.add(tf.layers.dense({units: 64, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dense({units: 64, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dropout(0.2))
    // model.add(tf.layers.dense({units: 64, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dense({units: 64, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dropout(0.2))
    // model.add(tf.layers.dense({units: 64, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dropout(0.2))
    // model.add(tf.layers.dense({units: 32, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dense({units: 32, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dense({units: 32, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dropout(0.2))
    // model.add(tf.layers.dense({units: 32, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dense({units: 32, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dense({units: 32, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dense({units: 16, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dropout(0.2))
    // model.add(tf.layers.dense({units: 16, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dense({units: 16, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dense({units: 16, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dropout(0.2))
    // model.add(tf.layers.dense({units: 16, activation: 'relu'}, tf.regularizers.l1l2()));
    // model.add(tf.layers.dense({units: 16, activation: 'relu'}, tf.regularizers.l1l2()));
    model.add(tf.layers.dense({units: 1, activation: 'softmax'}))

    console.log(model.summary())

    model.compile({
        optimizer: 'adam',
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
    })


    // For training visualizations
    const metrics = ['loss', 'val_loss', 'acc', 'val_acc'];
    const container = {
        name: 'Model Training', tab: 'Model', styles: { height: '1000px' }
    };
    const fitCallbacks = tfvis.show.fitCallbacks(container, metrics);

    let results = await model.fit(predictFeatures, tf.stack(databaseY), {
        epochs: 35,
        batchSize: 32,
        validationSplit: 0.3,
        shuffle: true,
        callbacks: fitCallbacks
    }).then(() => {
    tf.dispose(predictFeatures)
    tf.dispose(databaseY)
    })
}

var button = document.getElementById('train');

// button.onclick = async function () {
//     // Memory at the beginning
//     console.log("BEFORE: " + tf.memory().numTensors)
//     numPresses = numPresses + 1;
//     // adding to globalKeys
//     await addFromIndexDb();

//     // shuffling the array
//     globalKeys = shuffleArray(globalKeys)

//     alert('Starting Model Training')

//     let model = getModel();
//     model.summary()

//     for (let i = 0; i < globalKeys.length; i++) {
//         let res = await localforage.getItem(globalKeys[i])
//         if (!fileNames.has(globalKeys[i]) || numPresses <= 1) {
//             if (res['data-label'] === "POT1"){
//                 databaseY.push(1)
//             } else {
//                 databaseY.push(0)
//             }
//             // converts the image to tensors (databaseX)
//             await imageToTensor(res['base64'])
//             console.log(databaseX)
//             console.log(databaseY)
//         }

//         // Trains in batches of 20
//         if (i != 0 && i % 20 === 0) {
//             console.log(databaseX.length)
//             console.log(databaseY.length)
            
//             let inputs = tf.stack(databaseX)
//             let labels = tf.stack(databaseY)
            
//             // do not need these arrays anymore
//             tf.dispose(databaseX)
//             tf.dispose(databaseY)

//             databaseX = []
//             databaseY = []

//             // check to see if arrays have cleared succesfully
//             // console.log('databaseX ' + databaseX)
//             // console.log('databaseY ' + databaseY)

//             const metrics = ['loss', 'val_loss', 'acc', 'val_acc'];
//             const container = {
//                 name: 'Model Training', tab: 'Model', styles: { height: '1000px' }
//             };
//             const fitCallbacks = tfvis.show.fitCallbacks(container, metrics);

            
//             let results = await model.fit(inputs, labels, {
//                     epochs: 5,
//                     batchSize: 32,
//                     verbose: 1,
//                     validationSplit: 0.2,
//                     shuffle: true,
//                     callbacks: [fitCallbacks]
//                 })
            
//             console.log(history)
//             tf.dispose(inputs)
//             tf.dispose(labels)
//             //tf.dispose(model)
//             console.log("AFTER: " + tf.memory().numTensors)
//         }
//     }

//     await localforage.iterate(function (value, key, iterationNumber) {
//         fileNames.add(key)
//      })

//     console.log("AFTER: " + tf.memory().numTensors)
// }


button.onclick = async function () {
    numPresses = numPresses + 1;
    await addFromIndexDb();

    console.log(globalKeys)

    for (let i = 0; i < globalKeys.length; i++) {
        let res = await localforage.getItem(globalKeys[i])
        if (!fileNames.has(res['fileName']) || numPresses <= 1) {
            if (res['data-label'] === "POT1"){
                databaseY.push(1)
                //databaseY.push(1)
            } else {
                databaseY.push(0)
                //databaseY.push(0)
            }
            await imageToTensor(res.base64)
        }
    }

    await localforage.iterate(function (value, key, iterationNumber) {
        fileNames.add(value.fileName)
    })

    console.log(databaseY.length)
    console.log(databaseX.length)
    console.log(databaseX[1].print())
    console.log(databaseX[1].shape)


    let model = getModel();
    model.summary()

    let sum = databaseY.reduce((pSum, a) => pSum + a, 0)
    alert(`The database you created has ${databaseY.length} elements,
    ${sum} elements belonging to POT1, and ${databaseY.length-sum} belonging to NON-POT1`)

    // For training visualizations
    const metrics = ['loss', 'val_loss', 'acc', 'val_acc'];
    const container = {
        name: 'Model Training', tab: 'Model', styles: { height: '1000px' }
    };
    const fitCallbacks = tfvis.show.fitCallbacks(container, metrics);

    let results = await model.fit(tf.stack(databaseX), tf.stack(databaseY), {
        epochs: 20,
        batchSize: 16,
        validationSplit: 0.2,
        shuffle: true,
        callbacks: [fitCallbacks, tf.memory]
    })
}
    


window.onload = () => {
    initialize();
}