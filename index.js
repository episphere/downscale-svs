import imagebox3 from "https://episphere.github.io/imagebox3/imagebox3.mjs"

const initialize = () => {
    epibox.ini();
    if(!localStorage.epiBoxToken) return;
    getFolderIds();
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
    document.getElementById('thumbnailDiv').innerHTML = '<div class="loader"></div>';
    tileHandle(accessToken, select.value, files);
    onFileSelectionChange(accessToken, files);
}

const onFileSelectionChange = (accessToken, files) => {
    const select = document.getElementById('fileSelection');
    select.addEventListener('change', () => {
        document.getElementById('thumbnailDiv').innerHTML = '<div class="loader"></div>';
        const fileId = select.value;
        tileHandle(accessToken, fileId, files);
    })
}

const tileHandle = async (accessToken, fileId, files) => {
    const fileName = files.filter(dt => dt.id === fileId)[0].name;
    const imageURL = await getDownloadURL(accessToken, fileId);
    let imageInfo = null;
    // imageInfo = await (await imagebox3.getImageInfo(imageURL)).json();
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

const renderTileThumbnail = async (imageInfo, imageURL, fileName) => {
    let maxResolution = 4096;
    const tileParams = {
        tileHeight: 512,
        tileWidth: 512,
        tileX: 93503,
        tileY: 14336,
        tileSize: 256,
        thumbnailWidthToRender: maxResolution
    }
    
    const blob = await (await imagebox3.getImageThumbnail(imageURL, tileParams)).blob();
    const response = URL.createObjectURL(blob);
    
    const img = new Image();
    img.src = response;

    img.onload = () => {
        maxResolution = Math.max(img.width, img.height);
        const canvas = document.createElement('canvas');
        let desiredResolution = 512;
        let ratio = maxResolution / desiredResolution;
        canvas.width = desiredResolution;
        canvas.height = desiredResolution;
        const ctx = canvas.getContext('2d');
        let x = img.width === maxResolution ? 0 : Math.floor(Math.abs(desiredResolution - img.width / ratio) * 0.5);
        let y = img.height === maxResolution ? 0 : Math.floor(Math.abs(desiredResolution - img.height / ratio) * 0.5);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, desiredResolution, desiredResolution);
        ctx.drawImage(img, 0, 0, maxResolution, maxResolution, x, y, desiredResolution, desiredResolution);
        const dataURL = canvas.toDataURL(blob.type);
        const img2 = document.createElement('img');
        img2.className = "tile-thumbnail"
        img2.src = dataURL;

        const thumbnailDiv = document.getElementById('thumbnailDiv');
        thumbnailDiv.innerHTML = '';
        thumbnailDiv.appendChild(img2);

        const div = document.createElement('div');
        div.innerHTML = `<button id="uploadImage">Upload image to BOX</button>`;
        div.className = "new-line mr-top-10";
        thumbnailDiv.appendChild(div);

        
        desiredResolution = 4096;
        ratio = maxResolution / desiredResolution;
        x = img.width === maxResolution ? 0 : (desiredResolution - img.width/ratio) * 0.5;
        y = img.height === maxResolution ? 0 : (desiredResolution - img.height/ratio) * 0.5;
        const hiddenCanvas = document.createElement('canvas');
        hiddenCanvas.width = desiredResolution;
        hiddenCanvas.height = desiredResolution;
        const hiddenCtx = hiddenCanvas.getContext('2d');
        hiddenCtx.fillStyle = 'white';
        hiddenCtx.fillRect(0, 0, desiredResolution, desiredResolution);
        hiddenCtx.drawImage(img, 0, 0, maxResolution, maxResolution, x, y, desiredResolution, desiredResolution);

        
        hiddenCanvas.toBlob((blob) => {
            handleImageUpload(blob, fileName);
        }, 'image/jpeg', 1);
    }
}

const handleImageUpload = async (blob, fileName) => {
    const button = document.getElementById('uploadImage');
    button.addEventListener('click', async () => {
        fileName = fileName.substring(0, fileName.lastIndexOf('.'))+'.jpeg';
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
        document.getElementById('thumbnailDiv').appendChild(p);
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