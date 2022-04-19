import imagebox3 from "https://episphere.github.io/imagebox3/imagebox3.mjs"

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
                        Maginification level: <input type="number" id="magnificationLevel" min="3" max="20" value="10"> x
                    </div>
                    
                `;
                tileRangeSelector.classList.remove('slidecontainer')
            }
            else {
                tileRangeSelector.classList.add('slidecontainer')
                tileRangeSelector.innerHTML = `
                                    <input type="range" min="0" max="96" value="8" step="8" class="slider" id="myRange">
                                    <span id="sliderValue">8 tiles (2.8x)</span>`;
                displaySliderValue();
            }
        });
    });

}

const displaySliderValue = () => {
    const myRange = document.getElementById("myRange");
    if(!myRange) return;
    myRange.addEventListener('input', () => {
        const value = myRange.value === '0' ? 'whole image (1x)' : myRange.value+' tiles ('+Math.sqrt(myRange.value).toFixed(1)+'x)';
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
        const accessToken = JSON.parse(localStorage.epiBoxToken).access_token;
        let items = await getFolderItems(accessToken, inputFolderId);
        renderFileSelection(items.entries, accessToken);
    })
    
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
        const option = document.createElement('option');
        option.value = file.id;
        option.innerText = file.name;
        if(index === 0) option.selected = true;
        select.appendChild(option);
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
        tileHandle(accessToken, fileId, files);
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
    renderTileThumbnail(imageInfo, imageURL, fileName);
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

const renderTileThumbnail = async (imageInfo, imageURL, imageName) => {
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
    div.innerHTML = `<button id="uploadImage">Upload to BOX</button>`;
    thumbnailDiv.appendChild(div);
    const canvases = Array.from(document.getElementsByClassName('uploadCanvas'));
    canvases.forEach(canvas => {
        canvas.remove();
    });

    if(!magnification) {
        const blob = await (await imagebox3.getImageThumbnail(imageURL, {thumbnailWidthToRender: 512})).blob();
        const pixelsWithTissue = await getWholeSlidePixelData(blob, 512, imageURL);
        const tiles = document.getElementById('noOfTiles').value;
        const magnificationLevel = document.getElementById('magnificationLevel').value;
        const imageDiv = document.createElement('div');
        imageDiv.classList = 'row';
        imageDiv.id = 'imageDiv';
        document.body.appendChild(imageDiv);
        for(let i = 0; i < tiles; i++) {
            const random = Math.floor(Math.random() * pixelsWithTissue.length);
            const xy = pixelsWithTissue[random];
            const fileName = imageName.substring(0, imageName.lastIndexOf('.'))+'_' +(i+1)+'.jpeg';
            await extractRandomTile(xy, imageInfo.width/magnificationLevel, imageInfo.height/magnificationLevel, imageURL, imageDiv, fileName);
        }
        canvasEvents();
        handleImageUpload(imageDiv);
    }
    else if(magnification === '0') {
        const blob = await (await imagebox3.getImageThumbnail(imageURL, {thumbnailWidthToRender: 512})).blob();
        const fileName = imageName.substring(0, imageName.lastIndexOf('.'))+'.jpeg';
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
            const fileName = imageName.substring(0, imageName.lastIndexOf('.'))+'_' +(i+1)+'.jpeg';
            await canvasHandler(tileBlob, fileName, tileParams.tileSize, imageDiv, true);
        }
        canvasEvents();
        handleImageUpload(imageDiv);
    }
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
            canvas.classList = 'uploadCanvas';
            const threshbold = 225;
            if(avgBlue < threshbold && avgGreen < threshbold && avgRed < threshbold) {
                canvas.classList.add('tile-thumbnail-selected');
            }
    
            if(smallerImage) canvas.classList.add("tile-thumbnail")
            else canvas.classList.add('whole-image');
            thumbnailDiv.appendChild(canvas);
            resolve(true);
        }
    })
    
}

const getWholeSlidePixelData = (blob, desiredResolution) => {
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
            const imageDataArray = [];
            let pixelCounter = 0;
            for(let i = 0; i < imageData.length; i += 4) {
                const threshbold = 220;
                if(imageData[i] < threshbold || imageData[i+1] < threshbold || imageData[i+2] < threshbold || imageData[i+3] < threshbold) {
                    const x = Math.floor((pixelCounter / 4) % canvas.width);
                    const y = Math.floor((pixelCounter / 4) / canvas.width);
                    const pixelArray = [x, y];
                    imageDataArray.push(pixelArray);
                }
                pixelCounter++;
            }
            resolve(imageDataArray);
        }
    })
    
}

const extractRandomTile = async ([x, y], widthIncrements, heightIncrements, imageURL, imageDiv, fileName) => {
    return new Promise(async (resolve, reject) => {
        let tileParams = {
            tileSize: 1024,
            tileX: x*248,
            tileY: y*130,
            tileWidth: widthIncrements,
            tileHeight: heightIncrements
        };
        const blob = await (await imagebox3.getImageTile(imageURL, tileParams)).blob();
    
        let maxResolution = 1024;
        const response = URL.createObjectURL(blob);
        
        const img = new Image();
        img.src = response;
    
        img.onload = () => {
            let desiredResolution = 1024;
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
           
            canvas.dataset.fileName = fileName;
            canvas.classList.add('uploadCanvas');
            canvas.classList.add('tile-thumbnail-selected');
            canvas.classList.add("tile-thumbnail");
            imageDiv.appendChild(canvas);
            resolve(true)
        }
    })
}

const canvasEvents = () => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    canvases.forEach(canvas => {
        canvas.addEventListener('click', e => {
            e.stopPropagation();
            if(canvas.classList.contains('tile-thumbnail-selected')) {
                canvas.classList.remove('tile-thumbnail-selected');
            }
            else {
                canvas.classList.add('tile-thumbnail-selected');
            }

            const selectedTiles = Array.from(document.querySelectorAll('.tile-thumbnail-selected'));
            if(selectedTiles.length > 0) document.getElementById('uploadImage').innerHTML = `Upload ${selectedTiles.length} tile(s) to BOX`;
            else document.getElementById('uploadImage').innerHTML = `Upload all tiles to BOX`;
        });
    });
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

const handleImageUpload = async (thumbnailDiv) => {
    const button = document.getElementById('uploadImage');
    button.addEventListener('click', () => {
        let canvases;
        const selectedTiles = Array.from(document.querySelectorAll('.tile-thumbnail-selected'));
        if(selectedTiles.length > 0) canvases = selectedTiles;
        else canvases = Array.from(document.getElementsByClassName('uploadCanvas'));
        
        for(let c = 0; c < canvases.length; c++) {
            let fileName = canvases[c].dataset.fileName;
            canvases[c].toBlob(async (blob) => {
                const accessToken = JSON.parse(localStorage.epiBoxToken).access_token;
                const outputFolderId = document.getElementById('outputFolderId').value;
                const image = new File([blob], fileName, { type: blob.type });
                const formData = new FormData();
                formData.append('file', image);
                formData.append('attributes', `{"name": "${fileName}", "parent": {"id": "${outputFolderId}"}}`);
                let response = await uploadFile(accessToken, formData);
                let message = '';
                if(response.status === 201) message = `${fileName} uploaded successfully</span>`;
                if(response.status === 409) {
                    const json = await response.json();
                    const existingFileId = json.context_info.conflicts.id;
                    uploadNewVersion(accessToken, existingFileId, formData);
                    message = `${fileName} uploaded new version</span>`;
                }
                const p = document.createElement('p');
                p.innerHTML = `<span class="success">${message}</span>`;
                thumbnailDiv.appendChild(p);
            }, 'image/jpeg', 1);
        }
        
    })
}

const uploadFile = async (accessToken, formData) => {
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

window.onload = () => {
    initialize();
}