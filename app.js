// app.js

// -- VARIABEL GLOBAL -- //
let camera, scene, renderer, controller, model;
let fallbackScene, fallbackCamera, fallbackRenderer, controls;

// Deteksi jenis perangkat
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(navigator.userAgent);
const isMobile = isIOS || isAndroid;

let isARSupported = false;

// PERBAIKAN: Default model & Path model disesuaikan dengan nama file Anda
let currentModel = 'Retainning_Wall_1_Side_Corner_L';
const modelUrls = {
    'Retainning_Wall_1_Side_Corner_L': { glb: './assets/Retainning_Wall_1_Side_Corner_L.glb', usdz: './assets/Retainning_Wall_1_Side_Corner_L.usdz' },
    'Retainning_Wall_1_Side_Middle': { glb: './assets/Retainning_Wall_1_Side_Middle.glb', usdz: './assets/Retainning_Wall_1_Side_Middle.usdz' },
    'Retainning_Wall_1_Side_Corner_R': { glb: './assets/Retainning_Wall_1_Side_Corner_R.glb', usdz: './assets/Retainning_Wall_1_Side_Corner_R.usdz' }
};

let currentModelUrl = modelUrls[currentModel].glb;
const modelUnitScale = 0.01;
let userModelScale = 1;
let initialPinchDistance = null;
let initialPinchScale = 1;

const modelDimensions = {
    length: 0,
    width: 0,
    height: 0,
    volume: 0
};
const baseModelDimensions = {
    length: 0,
    width: 0,
    height: 0
};

// -- INISIALISASI APLIKASI -- //
document.addEventListener('DOMContentLoaded', init);

async function init() {
    setupEventListeners();

    // Cek dukungan AR
    try {
        isARSupported = await checkARSupport();
        console.log("AR Supported:", isARSupported);
    } catch (e) {
        console.error("Gagal mengecek dukungan AR:", e);
        isARSupported = false;
    }
    
    // Sembunyikan tombol AR jika tidak didukung (kecuali di iOS dengan Quick Look)
    if (!isARSupported && !isIOS) {
        const arButton = document.getElementById('ar-button');
        if(arButton) arButton.style.display = 'none';
    }
}

// -- PENGATURAN EVENT LISTENER -- //
function setupEventListeners() {
    // Pemilihan model
    document.querySelectorAll('.tower-option').forEach(option => {
        option.addEventListener('click', handleSelection);
    });

    // Tombol kembali
    document.getElementById('back-button').addEventListener('click', showMainMenu);
    const quicklookBack = document.getElementById('quicklook-back');
    if (quicklookBack) {
        quicklookBack.addEventListener('click', showMainMenu);
    }

    const iosArButton = document.getElementById('ios-ar-button');
    if (iosArButton) {
        iosArButton.addEventListener('click', openIosQuickLook);
    }
    
    // Resize window dengan debounce
    window.addEventListener('resize', debounce(onWindowResize, 150));
}

// -- FUNGSI UTAMA -- //

function handleSelection(e) {
    e.preventDefault();
    
    const selectedModel = this.getAttribute('data-model');
    if (!selectedModel) return;

    currentModel = selectedModel;
    
    // PERBAIKAN: Ambil URL sesuai dengan data-model yang diklik
    if(modelUrls[currentModel]) {
        currentModelUrl = modelUrls[currentModel].glb;
    } else {
        currentModelUrl = `./assets/${currentModel}.glb`; // Fallback jika tidak ada di dict
    }
    
    // Memberikan umpan balik visual saat item dipilih
    this.style.transform = 'scale(0.95)';
    setTimeout(() => {
        this.style.transform = '';
    }, 150);

    loadModelViewer();
}

function loadModelViewer() {
    // Sembunyikan menu utama dan tampilkan halaman viewer
    document.getElementById('main-menu').classList.add('d-none');
    document.getElementById('viewer-page').classList.remove('d-none');

    if (isIOS) {
        init3DFallback();
        const iosArButton = document.getElementById('ios-ar-button');
        if (iosArButton) iosArButton.classList.remove('d-none');
    } else if (isARSupported) {
        initWebXR();
    } else {
        init3DFallback(); // Desktop akan masuk ke sini
    }
}

function openIosQuickLook() {
    const arQuickLookPage = document.getElementById('ar-quicklook');
    const modelLink = arQuickLookPage && arQuickLookPage.querySelector(`a[href*="${currentModel}"]`);
    if (modelLink) modelLink.click();
}

async function checkARSupport() {
    if (!navigator.xr) return false;
    try {
        return await navigator.xr.isSessionSupported('immersive-ar');
    } catch (e) {
        console.error("Error saat mengecek sesi AR:", e);
        return false;
    }
}

function initWebXR() {
    cleanupRenderers();

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 40);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding; // PERBAIKAN: Penting untuk warna GLB
    renderer.xr.enabled = true;
    
    document.getElementById('viewer-page').appendChild(renderer.domElement);
    bindModelScaleGesture(renderer.domElement);

    const arButton = document.getElementById('ar-button');
    if(arButton) arButton.style.display = 'block';

    const sessionInit = { 
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.getElementById('viewer-page') }
    };
    document.body.appendChild(ARButton.createButton(renderer, sessionInit));

    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);
    
    loadModel().then(gltf => {
        model = gltf.scene;
        model.visible = false;
        scene.add(model);
    }).catch(init3DFallback);

    renderer.setAnimationLoop(() => renderer.render(scene, camera));
}

function init3DFallback() {
    cleanupRenderers();
    
    const fallbackContainer = document.getElementById('fallback-container');
    fallbackContainer.style.display = 'block';

    const arButton = document.getElementById('ar-button');
    if(arButton) arButton.style.display = 'none';
    
    showInfo("Memuat model 3D...");

    fallbackScene = new THREE.Scene();
    fallbackScene.background = new THREE.Color(0xf8f9fa); // Mengikuti class bg-light bootstrap
    fallbackCamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    fallbackCamera.position.set(0, 2, 5); // Posisi default kamera ditarik agak mundur agar terlihat full

    fallbackRenderer = new THREE.WebGLRenderer({ antialias: true });
    fallbackRenderer.setPixelRatio(window.devicePixelRatio);
    fallbackRenderer.setSize(window.innerWidth, window.innerHeight);
    fallbackRenderer.outputEncoding = THREE.sRGBEncoding; // PERBAIKAN: Sangat vital agar warna GLB akurat
    fallbackContainer.appendChild(fallbackRenderer.domElement);
    bindModelScaleGesture(fallbackRenderer.domElement);
    
    // PERBAIKAN: Menambahkan lampu agar sisi kanan kiri terang
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    fallbackScene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(5, 10, 5);
    fallbackScene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-5, 10, -5);
    fallbackScene.add(dirLight2);

    // Kontrol orbit
    controls = new THREE.OrbitControls(fallbackCamera, fallbackRenderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 1;
    controls.maxDistance = 20;
    controls.target.set(0, 1, 0); // Focus kamera ke tengah (Y=1)
    
    // Muat model
    loadModel().then(gltf => {
        model = gltf.scene;
        fallbackScene.add(model);
        showInfo("Mode 3D - Gunakan mouse untuk memutar.");
    });

    // Loop animasi
    const animateFallback = () => {
        if (!fallbackRenderer) return; 
        
        requestAnimationFrame(animateFallback);
        if (controls) controls.update();
        if (fallbackRenderer && fallbackScene && fallbackCamera) {
            fallbackRenderer.render(fallbackScene, fallbackCamera);
        }
    };
    animateFallback();
}

function loadModel() {
    return new Promise((resolve, reject) => {
        const loader = new THREE.GLTFLoader();
        loader.load(currentModelUrl, 
            gltf => {
                console.log("Model berhasil dimuat:", currentModel);

                userModelScale = 1;
                gltf.scene.scale.setScalar(modelUnitScale);
                
                // Atur skala dan pusatkan posisi model
                const box = new THREE.Box3().setFromObject(gltf.scene);
                updateModelDimensions(box);
                const center = box.getCenter(new THREE.Vector3());
                gltf.scene.position.sub(center); 
                
                // Tambahkan sedikit offset Y agar model menapak di dasar dengan pas (jika diinginkan)
                gltf.scene.position.y += (box.max.y - box.min.y) / 2;

                resolve(gltf);
            }, 
            undefined, 
            error => {
                console.error("Gagal memuat model:", error);
                showInfo(`Gagal memuat model ${currentModel}`);
                reject(error);
            }
        );
    });
}

function updateModelDimensions(box) {
    const size = box.getSize(new THREE.Vector3());

    baseModelDimensions.length = size.x;
    baseModelDimensions.width = size.z;
    baseModelDimensions.height = size.y;
    updateDisplayedDimensions();
}

function updateDisplayedDimensions() {
    modelDimensions.length = baseModelDimensions.length * userModelScale;
    modelDimensions.width = baseModelDimensions.width * userModelScale;
    modelDimensions.height = baseModelDimensions.height * userModelScale;
    modelDimensions.volume = modelDimensions.length * modelDimensions.width * modelDimensions.height;

    const dimensionsBox = document.getElementById('dimensions-box');
    if (!dimensionsBox) return;

    dimensionsBox.innerHTML = `
        <div class="dimensions-title">Dimensi Retaining Wall</div>
        <div class="dimension-row"><span>Panjang</span><strong>${formatDimension(modelDimensions.length)} m</strong></div>
        <div class="dimension-row"><span>Lebar</span><strong>${formatDimension(modelDimensions.width)} m</strong></div>
        <div class="dimension-row"><span>Tinggi</span><strong>${formatDimension(modelDimensions.height)} m</strong></div>
        <div class="dimension-volume"><span>Volume (P x L x T)</span><strong>${formatDimension(modelDimensions.volume)} m³</strong></div>
        <small>Perkiraan dari bounding box model 3D</small>
    `;
    dimensionsBox.classList.remove('d-none');
}

function bindModelScaleGesture(canvas) {
    canvas.addEventListener('touchstart', event => {
        if (event.touches.length !== 2) return;

        initialPinchDistance = getTouchDistance(event.touches);
        initialPinchScale = userModelScale;
    }, { passive: false });

    canvas.addEventListener('touchmove', event => {
        if (event.touches.length !== 2 || !model || !initialPinchDistance) return;

        event.preventDefault();
        const pinchDistance = getTouchDistance(event.touches);
        userModelScale = THREE.MathUtils.clamp(
            initialPinchScale * (pinchDistance / initialPinchDistance),
            0.25,
            4
        );
        model.scale.setScalar(modelUnitScale * userModelScale);
        updateDisplayedDimensions();
    }, { passive: false });

    canvas.addEventListener('touchend', event => {
        if (event.touches.length < 2) initialPinchDistance = null;
    }, { passive: false });
}

function getTouchDistance(touches) {
    const horizontalDistance = touches[0].clientX - touches[1].clientX;
    const verticalDistance = touches[0].clientY - touches[1].clientY;
    return Math.hypot(horizontalDistance, verticalDistance);
}

function formatDimension(value) {
    return value.toFixed(2).replace('.', ',');
}

function onSelect() {
    if (model) {
        const hitTestSource = null;
        if (hitTestSource) {
        } else {
            model.position.set(0, 0, -2).applyMatrix4(controller.matrixWorld);
            model.quaternion.setFromRotationMatrix(controller.matrixWorld);
        }
        model.visible = true;
        showInfo("Objek ditempatkan. Anda bisa bergerak di sekitarnya.");
    }
}

// -- FUNGSI UTILITAS -- //

function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (renderer && camera) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }

    if (fallbackRenderer && fallbackCamera) {
        fallbackCamera.aspect = width / height;
        fallbackCamera.updateProjectionMatrix();
        fallbackRenderer.setSize(width, height);
    }
}

function showInfo(message) {
    const infoBox = document.getElementById('info-box');
    infoBox.textContent = message;
    infoBox.style.display = 'block';
    
    // Jangan sembunyikan jika pesannya adalah "Memuat model..."
    if(message !== "Memuat model...") {
        setTimeout(() => {
            infoBox.style.display = 'none';
        }, 4000);
    }
}

function showMainMenu() {
    document.getElementById('viewer-page').classList.add('d-none');
    document.getElementById('main-menu').classList.remove('d-none');
    
    const arQuickLookPage = document.getElementById('ar-quicklook');
    if (arQuickLookPage) {
        arQuickLookPage.classList.add('d-none');
    }
    
    cleanupRenderers();

    const iosArButton = document.getElementById('ios-ar-button');
    if (iosArButton) iosArButton.classList.add('d-none');
}

function cleanupRenderers() {
    if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        renderer = null;
    }
    
    if (fallbackRenderer) {
        if (controls) {
            controls.dispose();
            controls = null;
        }
        
        fallbackRenderer.dispose();
        if (fallbackRenderer.domElement.parentNode) {
            fallbackRenderer.domElement.parentNode.removeChild(fallbackRenderer.domElement);
        }
        fallbackRenderer = null;
    }
    
    if (scene) scene = null;
    if (camera) camera = null;
    if (fallbackScene) fallbackScene = null;
    if (fallbackCamera) fallbackCamera = null;
    if (model) model = null;

    const dimensionsBox = document.getElementById('dimensions-box');
    if (dimensionsBox) dimensionsBox.classList.add('d-none');
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}
