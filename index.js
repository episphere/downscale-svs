import imagebox3 from "https://episphere.github.io/imagebox3/imagebox3.mjs";
const lowerThreshold = 150;
const upperThreshold = 230;

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
            const fileName = imageName.substring(0, imageName.lastIndexOf('.'))+`_x${x}_y${y}_${Math.max(scaledWidth, scaledHeight)}_1024_${magnificationLevel}x_${i+1}.jpeg`;
            await extractRandomTile([x, y], scaledWidth, scaledHeight, imageURL, imageDiv, fileName);
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
        if(red < upperThreshold && green < upperThreshold && blue < upperThreshold) pixelsWithTissue.push(pixelArray);
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
                if(selectedTiles.length > 0) document.getElementById('uploadImage').innerHTML = `Upload ${selectedTiles.length + 1} tile(s) to BOX`;
            }
    
            if(smallerImage) canvas.classList.add("tile-thumbnail")
            else canvas.classList.add('whole-image');
            thumbnailDiv.appendChild(canvas);
            resolve(true);
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

const extractRandomTile = async ([tilex, tiley], widthIncrements, heightIncrements, imageURL, imageDiv, fileName) => {
    return new Promise(async (resolve, reject) => {
        let tileParams = {
            tileSize: 1024,
            tileX: tilex,
            tileY: tiley,
            tileWidth: Math.max(widthIncrements, heightIncrements),
            tileHeight: Math.max(widthIncrements, heightIncrements)
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
                if(selectedTiles.length > 0) document.getElementById('uploadImage').innerHTML = `Upload ${selectedTiles.length + 1} tile(s) to BOX`;
            }
            canvas.dataset.fileName = fileName;
            canvas.classList.add('uploadCanvas');
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