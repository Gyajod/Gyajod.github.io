// 高德地图API配置 - 请替换为你的真实密钥
const apiKey = 'b8ccb9f503ab3342a3e0822ed1efd6c3'; // 替换这里
const securityKey = '3f933190ceb617f6f14de914a3f95cb0'; // 如果有的话

// 全局变量
let map;
let allHospitals = [];
let subwayStations = [];
let currentCircle = null;
let hospitalMarkers = [];
let subwayMarkers = [];
let currentStation = null;
let routePolylines = []; // 存储路线
let currentRoutePolylines = []; // 当前显示的路线
let calculatedRoutes = new Map(); // 存储已计算的路径

// 配置安全密钥
if (securityKey && securityKey !== '你的安全密钥') {
    window._AMapSecurityConfig = {
        securityJsCode: securityKey
    };
    console.log('安全密钥已配置');
}

// 初始化地图
function initMap() {
    console.log('开始初始化地图...');

    try {
        map = new AMap.Map('map', {
            viewMode: '2D', // 先用2D确保兼容性
            zoom: 11,
            center: [116.405285, 39.904989],
            mapStyle: 'amap://styles/normal',
            pitch: 0,
            rotation: 0
        });

        console.log('地图创建成功');

        // 添加一个测试标记确认地图工作
        const testMarker = new AMap.Marker({
            position: [116.405285, 39.904989],
            title: '测试点 - 北京市中心',
            map: map
        });

        // 先初始化搜索功能，再加载数据
        initSearch();

        // 加载数据
        loadData();

    } catch (error) {
        console.error('地图初始化失败:', error);
        alert('地图初始化失败: ' + error.message);
    }
}

// 初始化搜索功能
function initSearch() {
    const searchInput = document.getElementById('station-search');
    const searchButton = document.getElementById('search-button');

    if (searchButton && searchInput) {
        searchButton.addEventListener('click', searchStation);
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchStation();
            }
        });
        console.log('搜索功能初始化完成');
    } else {
        console.error('搜索元素未找到');
    }
}

// 搜索地铁站
async function searchStation() {
    const searchInput = document.getElementById('station-search');
    if (!searchInput) return;

    const searchTerm = searchInput.value.trim();
    if (!searchTerm) {
        alert('请输入地铁站名称');
        return;
    }

    console.log('搜索:', searchTerm);

    // 检查数据是否已加载
    if (!subwayStations || subwayStations.length === 0) {
        alert('数据正在加载中，请稍后再试');
        return;
    }

    // 更宽松的搜索条件 - 忽略大小写
    const foundStation = subwayStations.find(station =>
        station.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        station.lines.some(line => line.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (foundStation) {
        console.log('找到站点:', foundStation.name);

        // 确保地图标记已经渲染
        if (subwayMarkers.length === 0) {
            console.log('重新渲染地铁站标记...');
            renderSubwayStations();
        }

        // 清除之前的高亮
        subwayMarkers.forEach(marker => {
            if (marker && marker.setIcon) {
                marker.setIcon(createSubwayIcon(false));
            }
        });

        // 高亮显示找到的站点
        const targetMarker = subwayMarkers.find(marker => {
            const extData = marker.getExtData();
            return extData && extData.name === foundStation.name;
        });

        if (targetMarker) {
            targetMarker.setIcon(createSubwayIcon(true));
            if (targetMarker.setAnimation) {
                targetMarker.setAnimation('AMAP_ANIMATION_BOUNCE');
                setTimeout(() => {
                    if (targetMarker.setAnimation) {
                        targetMarker.setAnimation('');
                    }
                }, 2000);
            }
        }

        // 显示医疗覆盖范围，并进行路径规划
        await showMedicalCoverage(foundStation);

    } else {
        console.log('未找到站点，搜索词:', searchTerm);
        alert(`未找到包含"${searchTerm}"的地铁站，请检查站名是否正确\n\n可用站点示例：${subwayStations.slice(0, 3).map(s => s.name).join('、')}等`);
    }
}

// 创建地铁站图标（高亮状态可选）
function createSubwayIcon(highlighted = false) {
    const color = highlighted ? '#ff4757' : '#e74c3c';
    const size = highlighted ? 36 : 32;

    // 使用base64编码的SVG
    const svgString = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            <circle cx="${size/2}" cy="${size/2}" r="${size/2-2}" fill="${color}" stroke="white" stroke-width="2"/>
            <text x="${size/2}" y="${size/2+4}" font-family="Arial" font-size="12" fill="white" text-anchor="middle" font-weight="bold">🚇</text>
        </svg>
    `;

    // 将SVG字符串转换为base64
    const base64SVG = btoa(unescape(encodeURIComponent(svgString)));

    return new AMap.Icon({
        size: new AMap.Size(size, size),
        image: `data:image/svg+xml;base64,${base64SVG}`,
        imageSize: new AMap.Size(size, size)
    });
}

// 创建医院图标
function createHospitalIcon() {
    const size = 30;

    // 使用base64编码的SVG
    const svgString = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            <circle cx="15" cy="15" r="13" fill="#27ae60" stroke="white" stroke-width="2"/>
            <rect x="13" y="8" width="4" height="14" fill="white" rx="1"/>
            <rect x="8" y="13" width="14" height="4" fill="white" rx="1"/>
        </svg>
    `;

    const base64SVG = btoa(unescape(encodeURIComponent(svgString)));

    return new AMap.Icon({
        size: new AMap.Size(size, size),
        image: `data:image/svg+xml;base64,${base64SVG}`,
        imageSize: new AMap.Size(size, size)
    });
}

// 添加一个函数来创建更明显的医院图标
function createHospitalIcon() {
    const size = 32;  // 稍微增大图标

    // 使用base64编码的SVG - 增强对比度
    const svgString = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            <circle cx="16" cy="16" r="14" fill="#27ae60" stroke="#FFFFFF" stroke-width="3"/>
            <rect x="14" y="8" width="4" height="16" fill="#FFFFFF" rx="1"/>
            <rect x="8" y="14" width="16" height="4" fill="#FFFFFF" rx="1"/>
            <circle cx="16" cy="16" r="2" fill="#27ae60"/>
        </svg>
    `;

    const base64SVG = btoa(unescape(encodeURIComponent(svgString)));

    return new AMap.Icon({
        size: new AMap.Size(size, size),
        image: `data:image/svg+xml;base64,${base64SVG}`,
        imageSize: new AMap.Size(size, size)
    });
}

// 添加一个函数来创建更明显的地铁站图标
function createSubwayIcon(highlighted = false) {
    const color = highlighted ? '#ff4757' : '#e74c3c';
    const size = highlighted ? 40 : 36;  // 增大图标尺寸

    // 使用base64编码的SVG - 增强对比度
    const svgString = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            <circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" fill="${color}" stroke="#FFFFFF" stroke-width="3"/>
            <text x="${size/2}" y="${size/2+5}" font-family="Arial" font-size="14" fill="white" text-anchor="middle" font-weight="bold">🚇</text>
            <circle cx="${size/2}" cy="${size/2}" r="4" fill="#FFFFFF" opacity="0.8"/>
        </svg>
    `;

    const base64SVG = btoa(unescape(encodeURIComponent(svgString)));

    return new AMap.Icon({
        size: new AMap.Size(size, size),
        image: `data:image/svg+xml;base64,${base64SVG}`,
        imageSize: new AMap.Size(size, size)
    });
}
// 在数据加载成功后添加搜索建议
async function loadData() {
    console.log('开始加载数据...');

    try {
        const [subwayResponse, hospitalResponse] = await Promise.all([
            fetch('./data/subway_stations.json'),
            fetch('./data/hospitals.json')
        ]);

        console.log('数据响应状态:', {
            subway: subwayResponse.status,
            hospital: hospitalResponse.status
        });

        if (!subwayResponse.ok) {
            throw new Error(`地铁站数据加载失败: ${subwayResponse.status}`);
        }
        if (!hospitalResponse.ok) {
            throw new Error(`医院数据加载失败: ${hospitalResponse.status}`);
        }

        subwayStations = await subwayResponse.json();
        allHospitals = await hospitalResponse.json();

        console.log('数据加载成功:', {
            stations: subwayStations.length,
            hospitals: allHospitals.length
        });

        // 在控制台显示可用站点，方便调试
        console.log('可用地铁站:', subwayStations.map(s => s.name));

        // 渲染地铁站标记
        renderSubwayStations();

    } catch (error) {
        console.error('数据加载失败:', error);
        // 使用备用数据继续运行
        useBackupData();
    }
}

// 使用备用数据
function useBackupData() {
    console.log('使用备用数据...');

    // 简化的备用数据
    subwayStations = [
        {
            "name": "西直门",
            "lng": 116.355,
            "lat": 39.941,
            "lines": ["2号线", "4号线", "13号线"]
        },
        {
            "name": "东直门",
            "lng": 116.434,
            "lat": 39.947,
            "lines": ["2号线", "13号线", "首都机场线"]
        }
    ];

    allHospitals = [
        {
            "name": "北京协和医院",
            "lng": 116.417,
            "lat": 39.909,
            "type": "三甲",
            "address": "北京市东城区帅府园一号"
        },
        {
            "name": "北京大学第一医院",
            "lng": 116.367,
            "lat": 39.927,
            "type": "三甲",
            "address": "北京市西城区西什库大街8号"
        }
    ];

    renderSubwayStations();
}

// 渲染所有地铁站标记
function renderSubwayStations() {
    console.log('开始渲染地铁站标记，数量:', subwayStations.length);

    if (!map) {
        console.error('地图未初始化，无法渲染标记');
        return;
    }

    // 清除现有标记
    subwayMarkers.forEach(marker => {
        map.remove(marker);
    });
    subwayMarkers = [];

    subwayMarkers = subwayStations.map(station => {
        const marker = new AMap.Marker({
            position: [station.lng, station.lat],
            title: `${station.name} (${station.lines.join(', ')})`,
            map: map,
            icon: createSubwayIcon(),
            anchor: 'bottom-center',
            extData: station,
            zIndex: 150  // 确保地铁站标记在最上层
        });

        marker.on('click', async function() {
            console.log('点击地铁站:', station.name);
            // 清除之前的高亮
            subwayMarkers.forEach(m => {
                m.setIcon(createSubwayIcon(false));
            });
            // 高亮当前点击的站点
            marker.setIcon(createSubwayIcon(true));

            await showMedicalCoverage(station);
        });

        return marker;
    });

    console.log('地铁站标记渲染完成');
}

// 在显示医疗覆盖范围函数中确保圆圈显示优化
async function showMedicalCoverage(station) {
    console.log('显示医疗覆盖范围:', station.name);

    if (!map) {
        console.error('地图未初始化');
        return;
    }

    currentStation = station;

    // 清除之前的覆盖物
    clearPreviousCoverage();

    // 更新侧边栏信息
    updateSidebarInfo(station);

    // 绘制5公里范围圈 - 先绘制圆圈
    drawCoverageCircle(station);

    // 显示范围内的医院
    const hospitalsInRange = showHospitalsInRange(station);

    // 更新医院列表
    updateHospitalList(hospitalsInRange, station);

    // 为前三个医院计算路径规划
    if (hospitalsInRange.length > 0) {
        await calculateHospitalRoute(station, hospitalsInRange.slice(0, 3));
    }

    // 调整地图视野
    adjustMapView(station);
}

// 更新侧边栏信息
function updateSidebarInfo(station) {
    const stationNameEl = document.getElementById('station-name');
    const stationLinesEl = document.getElementById('station-lines');

    if (stationNameEl) stationNameEl.textContent = `${station.name}站`;
    if (stationLinesEl) stationLinesEl.textContent = `线路: ${station.lines.join(', ')}`;
}

// 绘制覆盖范围圆圈 - 优化版本
function drawCoverageCircle(station) {
    // 清除之前的圆圈
    if (currentCircle) {
        map.remove(currentCircle);
        currentCircle = null;
    }

    currentCircle = new AMap.Circle({
        center: [station.lng, station.lat],
        radius: 5000,
        strokeColor: "#FF6B6B",        // 改为更醒目的红色
        strokeWeight: 4,               // 增加边框宽度
        strokeOpacity: 0.9,            // 提高边框不透明度
        strokeDasharray: [8, 4],       // 调整虚线样式
        fillColor: '#FFE66D',          // 改为亮黄色填充
        fillOpacity: 0.25,             // 降低填充不透明度，确保下方内容可见
        map: map,
        zIndex: 20,                    // 确保圆圈在地图底层
        bubble: true
    });

    // 添加圆圈边框的动画效果
    let dashOffset = 0;
    const animateCircle = () => {
        dashOffset = (dashOffset + 1) % 24;
        currentCircle.setOptions({
            strokeDasharray: [8, 4],
            strokeDashoffset: -dashOffset
        });
        if (currentCircle) {
            requestAnimationFrame(animateCircle);
        }
    };
    animateCircle();
}

// 显示范围内的医院
function showHospitalsInRange(station) {
    const stationLnglat = new AMap.LngLat(station.lng, station.lat);
    let hospitalsInRange = [];

    allHospitals.forEach(hospital => {
        const hospitalLnglat = new AMap.LngLat(hospital.lng, hospital.lat);
        const distance = stationLnglat.distance(hospitalLnglat);

        if (distance <= 5000) {
            hospitalsInRange.push({
                ...hospital,
                distance: distance
            });
            createHospitalMarker(hospital, distance);
        }
    });

    // 按距离排序
    hospitalsInRange.sort((a, b) => a.distance - b.distance);

    // 更新医院数量和列表
    updateHospitalList(hospitalsInRange, station);

    return hospitalsInRange;
}

// 创建医院标记
function createHospitalMarker(hospital, distance) {
    const marker = new AMap.Marker({
        position: [hospital.lng, hospital.lat],
        title: `${hospital.name} (${(distance / 1000).toFixed(2)}km)`,
        map: map,
        icon: createHospitalIcon(),
        anchor: 'bottom-center',
        extData: hospital,
        zIndex: 100  // 确保医院标记在圆圈上方
    });

    hospitalMarkers.push(marker);
}

// 在 calculateHospitalRoute 函数中确保返回有效数据
async function calculateHospitalRoute(station, hospital) {
    const routeKey = `${station.name}_${hospital.name}`;

    // 检查是否已有缓存
    if (calculatedRoutes.has(routeKey)) {
        console.log('使用缓存的路径数据');
        return calculatedRoutes.get(routeKey);
    }

    showLoading(`正在计算到${hospital.name}的路径...`);

    try {
        await loadRoutePlugins();

        // 设置超时控制
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('计算超时')), 10000)
        );

        const routePromise = Promise.allSettled([
            calculateDrivingRoute(station, hospital),
            calculateRidingRoute(station, hospital)
        ]);

        const results = await Promise.race([routePromise, timeoutPromise]);

        const drivingResult = results[0].status === 'fulfilled' ? results[0].value : null;
        const ridingResult = results[1].status === 'fulfilled' ? results[1].value : null;

        const routeData = {
            driving: drivingResult,
            riding: ridingResult
        };

        // 缓存结果
        calculatedRoutes.set(routeKey, routeData);
        console.log('路径计算完成并缓存:', routeData);

        return routeData;

    } catch (error) {
        console.error('路径规划失败:', error);
        // 返回估算数据
        const estimatedData = getEstimatedRouteData(station, hospital);
        calculatedRoutes.set(routeKey, estimatedData);
        return estimatedData;
    } finally {
        hideLoading();
    }
}


// 获取估算路径数据
function getEstimatedRouteData(station, hospital) {
    const distance = new AMap.LngLat(station.lng, station.lat)
        .distance(new AMap.LngLat(hospital.lng, hospital.lat)) / 1000;

    return {
        driving: {
            duration: Math.round(distance * 2.5),
            distance: distance.toFixed(1),
            path: null,
            isEstimated: true
        },
        riding: {
            duration: Math.round(distance * 4),
            distance: distance.toFixed(1),
            path: null,
            isEstimated: true
        }
    };
}

// 优化路径计算函数，确保返回正确的路径数据
function calculateDrivingRoute(station, hospital) {
    return new Promise((resolve) => {
        const driving = new AMap.Driving({
            policy: AMap.DrivingPolicy.LEAST_TIME,
            hideMarkers: true,
            showTraffic: false,
            ferry: 1 // 允许轮渡
        });

        driving.search([station.lng, station.lat], [hospital.lng, hospital.lat],
            (status, result) => {
                console.log('驾车路径规划状态:', status);
                if (status === 'complete' && result.routes && result.routes.length > 0) {
                    const route = result.routes[0];
                    const path = [];

                    // 正确提取路径点
                    if (route.steps && route.steps.length > 0) {
                        route.steps.forEach(step => {
                            if (step.path && step.path.length > 0) {
                                path.push(...step.path);
                            }
                        });
                    }

                    const routeInfo = {
                        duration: Math.round(route.time / 60),
                        distance: (route.distance / 1000).toFixed(1),
                        path: path.length > 0 ? path : null
                    };
                    console.log('驾车路径信息:', routeInfo);
                    resolve(routeInfo);
                } else {
                    console.log('驾车路径规划失败:', status, result);
                    resolve(null);
                }
            }
        );
    });
}

function calculateRidingRoute(station, hospital) {
    return new Promise((resolve) => {
        const riding = new AMap.Riding({
            hideMarkers: true,
            policy: 0 // 推荐方案
        });

        riding.search([station.lng, station.lat], [hospital.lng, hospital.lat],
            (status, result) => {
                console.log('骑行路径规划状态:', status);
                if (status === 'complete' && result.routes && result.routes.length > 0) {
                    const route = result.routes[0];
                    const path = [];

                    // 正确提取路径点
                    if (route.steps && route.steps.length > 0) {
                        route.steps.forEach(step => {
                            if (step.path && step.path.length > 0) {
                                path.push(...step.path);
                            }
                        });
                    }

                    const routeInfo = {
                        duration: Math.round(route.time / 60),
                        distance: (route.distance / 1000).toFixed(1),
                        path: path.length > 0 ? path : null
                    };
                    console.log('骑行路径信息:', routeInfo);
                    resolve(routeInfo);
                } else {
                    console.log('骑行路径规划失败:', status, result);
                    resolve(null);
                }
            }
        );
    });
}


// 加载路径规划插件
function loadRoutePlugins() {
    return new Promise((resolve) => {
        if (window.AMap.Driving && window.AMap.Riding) {
            resolve();
            return;
        }
        AMap.plugin(['AMap.Driving', 'AMap.Riding'], resolve);
    });
}

// 在地图上显示路径 - 保留一个定义，修复显示逻辑
function showRouteOnMap(station, hospital, routeData) {
    console.log('开始显示路径:', {
        station: station.name,
        hospital: hospital.name,
        routeData: routeData
    });

    // 清除之前显示的路径
    clearCurrentRoutes();

    if (!routeData) {
        console.log('没有路径数据可显示');
        return;
    }

    const colors = {
        driving: '#1890FF',
        riding: '#52C41A'
    };

    let hasValidRoute = false;
    const allPaths = [];

    // 显示驾车路径
    if (routeData.driving && routeData.driving.path && routeData.driving.path.length > 0) {
        try {
            console.log('绘制驾车路径，点数:', routeData.driving.path.length);
            const drivingPolyline = new AMap.Polyline({
                path: routeData.driving.path,
                strokeColor: colors.driving,
                strokeWeight: 8,
                strokeOpacity: 0.9,
                strokeStyle: "solid",
                map: map,
                zIndex: 80  // 路径在圆圈上方，标记下方
            });
            currentRoutePolylines.push(drivingPolyline);
            allPaths.push(...routeData.driving.path);
            hasValidRoute = true;
            console.log('驾车路径绘制成功');
        } catch (error) {
            console.error('绘制驾车路径失败:', error);
        }
    }

    // 显示骑行路径
    if (routeData.riding && routeData.riding.path && routeData.riding.path.length > 0) {
        try {
            console.log('绘制骑行路径，点数:', routeData.riding.path.length);
            const ridingPolyline = new AMap.Polyline({
                path: routeData.riding.path,
                strokeColor: colors.riding,
                strokeWeight: 6,
                strokeOpacity: 0.8,
                strokeStyle: "dashed",
                map: map,
                zIndex: 80  // 路径在圆圈上方，标记下方
            });
            currentRoutePolylines.push(ridingPolyline);
            allPaths.push(...routeData.riding.path);
            hasValidRoute = true;
            console.log('骑行路径绘制成功');
        } catch (error) {
            console.error('绘制骑行路径失败:', error);
        }
    }

    // 调整地图视野显示完整路径
    if (hasValidRoute && allPaths.length > 0) {
        try {
            console.log('调整地图视野，路径点数量:', allPaths.length);

            // 创建包含所有路径点的边界
            const bounds = new AMap.Bounds();
            allPaths.forEach(point => {
                bounds.extend(point);
            });

            if (!bounds.isEmpty()) {
                // 添加一些边距，确保路径完全可见
                map.setBounds(bounds, false, [50, 50, 50, 350]);
                console.log('地图视野调整成功');
            } else {
                console.log('边界为空，使用默认视野');
                adjustMapView(station);
            }
        } catch (error) {
            console.error('调整地图视野失败:', error);
            adjustMapView(station);
        }
    } else {
        console.log('没有有效的路径可以调整视野');
        adjustMapView(station);
    }

    console.log('路径显示完成，当前路径数量:', currentRoutePolylines.length);
}


// 清除当前显示的路径 - 修复函数
function clearCurrentRoutes() {
    console.log('清除当前路径，数量:', currentRoutePolylines.length);

    currentRoutePolylines.forEach(polyline => {
        try {
            if (map && polyline) {
                map.remove(polyline);
            }
        } catch (error) {
            console.warn('移除路径时出错:', error);
        }
    });
    currentRoutePolylines = [];
}


// 更新医院列表
function updateHospitalList(hospitals, station) {
    const countElement = document.getElementById('hospital-count');
    const listElement = document.getElementById('hospital-list');

    if (countElement) {
        countElement.textContent = hospitals.length;
        countElement.style.color = hospitals.length > 0 ? '#4CAF50' : '#f44336';
    }

    if (!listElement) {
        console.error('医院列表元素未找到');
        return;
    }

    listElement.innerHTML = '';

    if (hospitals.length === 0) {
        const li = document.createElement('li');
        li.textContent = '该站点5公里范围内暂无医院';
        li.style.color = '#666';
        li.style.fontStyle = 'italic';
        li.style.padding = '15px';
        li.style.textAlign = 'center';
        listElement.appendChild(li);
        return;
    }

    hospitals.forEach((hospital, index) => {
        const li = document.createElement('li');
        const distanceInKm = (hospital.distance / 1000).toFixed(2);

        // 估算大致时间
        const estimatedDrivingTime = Math.round((hospital.distance / 1000) * 3);
        const estimatedRidingTime = Math.round((hospital.distance / 1000) * 5);

        // 所有医院都显示估算时间，点击后才计算详细路径
        const routeInfo = `
            <div class="route-estimate" style="margin-top: 8px; padding: 8px; background: #f8f9fa; border-radius: 6px; font-size: 12px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span style="color: #1890ff;">🚗 驾车 ~${estimatedDrivingTime}分钟</span>
                    <span style="color: #52c41a;">🚴 骑行 ~${estimatedRidingTime}分钟</span>
                </div>
                <div style="color: #999; font-size: 11px; text-align: center;">点击查看详细路径规划</div>
            </div>
        `;

        li.innerHTML = `
            <div style="margin-bottom: 8px;">
                <div style="display: flex; align-items: center; margin-bottom: 6px;">
                    <strong style="color: #2c3e50; font-size: ${index < 3 ? '15px' : '14px'}; flex: 1;">${hospital.name}</strong>
                    ${index < 3 ? '<span style="background: linear-gradient(135deg, #ff4d4f, #ff7875); color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold;">近</span>' : ''}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 12px; color: #7f8c8d; background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">${hospital.type}</span>
                    <span style="font-size: 13px; color: #e74c3c; font-weight: bold; background: #fff0f0; padding: 2px 8px; border-radius: 4px;">${distanceInKm} km</span>
                </div>
                <div style="font-size: 12px; color: #95a5a6; line-height: 1.4; margin-bottom: 8px;">${hospital.address}</div>
                ${routeInfo}
            </div>
        `;

        // 添加点击医院列表项的事件
        li.addEventListener('click', async function() {
            console.log(`点击医院: ${hospital.name}, 距离: ${distanceInKm}km`);

            // 清除其他医院的高亮
            hospitalMarkers.forEach(marker => {
                if (marker && marker.setIcon) {
                    marker.setIcon(createHospitalIcon());
                }
            });

            // 高亮当前医院
            const targetMarker = hospitalMarkers.find(marker => {
                const extData = marker.getExtData();
                return extData && extData.name === hospital.name;
            });

            if (targetMarker) {
                try {
                    targetMarker.setAnimation('AMAP_ANIMATION_BOUNCE');
                    setTimeout(() => {
                        if (targetMarker.setAnimation) {
                            targetMarker.setAnimation('');
                        }
                    }, 1500);
                } catch (error) {
                    console.warn('设置标记动画失败:', error);
                }
            }

            try {
                // 计算并显示路径
                console.log(`开始计算路径: ${station.name} -> ${hospital.name}`);
                const routeData = await calculateHospitalRoute(station, hospital);
                console.log('路径计算完成:', routeData);

                if (routeData) {
                    showRouteOnMap(station, hospital, routeData);
                    updateHospitalRouteInfo(hospital.name, routeData);
                } else {
                    console.error('路径数据为空');
                    alert('路径计算失败，请稍后重试');
                }

            } catch (error) {
                console.error('处理医院点击事件失败:', error);
                alert('路径计算失败: ' + error.message);
            }
        });

        li.style.cursor = 'pointer';
        li.style.padding = '15px';
        li.style.borderBottom = '1px solid #f0f0f0';
        li.style.transition = 'all 0.3s ease';
        li.style.position = 'relative';
        li.style.overflow = 'hidden';

        if (index < 3) {
            li.style.background = 'linear-gradient(135deg, #ffffff, #f0f7ff)';
            li.style.borderLeft = '4px solid #1890ff';
            li.style.boxShadow = '0 2px 8px rgba(24, 144, 255, 0.1)';
        } else {
            li.style.background = '#ffffff';
        }

        li.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#f0f7ff';
            this.style.transform = 'translateX(5px)';
            this.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
        });

        li.addEventListener('mouseleave', function() {
            if (index < 3) {
                this.style.background = 'linear-gradient(135deg, #ffffff, #f0f7ff)';
            } else {
                this.style.backgroundColor = '#ffffff';
            }
            this.style.transform = 'translateX(0)';
            this.style.boxShadow = index < 3 ? '0 2px 8px rgba(24, 144, 255, 0.1)' : 'none';
        });

        // 添加点击效果
        li.addEventListener('mousedown', function() {
            this.style.transform = 'translateX(5px) scale(0.98)';
        });

        li.addEventListener('mouseup', function() {
            this.style.transform = 'translateX(5px) scale(1)';
        });

        listElement.appendChild(li);
    });

    console.log(`医院列表更新完成，共 ${hospitals.length} 家医院`);
}

// 更新医院路径信息显示 - 修复显示逻辑
function updateHospitalRouteInfo(hospitalName, routeData) {
    const hospitalItems = document.querySelectorAll('#hospital-list li');

    hospitalItems.forEach(item => {
        const hospitalTitle = item.querySelector('strong');
        if (!hospitalTitle) return;

        if (hospitalTitle.textContent === hospitalName) {
            // 移除估算信息
            const estimateEl = item.querySelector('.route-estimate');
            if (estimateEl) {
                estimateEl.remove();
            }

            // 移除已有的详细路径信息
            const existingDetail = item.querySelector('.route-detail');
            if (existingDetail) {
                existingDetail.remove();
            }

            // 创建新的详细路径信息
            const routeInfo = document.createElement('div');
            routeInfo.className = 'route-detail';
            routeInfo.style.marginTop = '8px';
            routeInfo.style.padding = '10px';
            routeInfo.style.backgroundColor = '#f0f7ff';
            routeInfo.style.borderRadius = '6px';
            routeInfo.style.fontSize = '12px';
            routeInfo.style.border = '1px solid #1890ff';

            let detailHTML = '<div style="font-weight: bold; color: #1890ff; margin-bottom: 8px;">🗺️ 详细路径规划</div>';

            if (routeData && routeData.driving) {
                detailHTML += `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px; align-items: center;">
                        <span style="color: #1890ff;">🚗 驾车</span>
                        <span style="font-weight: bold; font-size: 13px;">${routeData.driving.duration}分钟 / ${routeData.driving.distance}km</span>
                    </div>
                `;
            } else {
                detailHTML += `
                    <div style="color: #999; margin-bottom: 5px;">🚗 驾车路线计算失败</div>
                `;
            }

            if (routeData && routeData.riding) {
                detailHTML += `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: #52c41a;">🚴 骑行</span>
                        <span style="font-weight: bold; font-size: 13px;">${routeData.riding.duration}分钟 / ${routeData.riding.distance}km</span>
                    </div>
                `;
            } else {
                detailHTML += `
                    <div style="color: #999;">🚴 骑行路线计算失败</div>
                `;
            }

            routeInfo.innerHTML = detailHTML;
            item.appendChild(routeInfo);

            // 高亮当前项
            item.style.background = 'linear-gradient(135deg, #e6f7ff, #f0f7ff)';
            item.style.borderLeft = '4px solid #1890ff';

        } else {
            // 恢复其他项的估算信息显示
            const index = Array.from(hospitalItems).indexOf(item);
            const hasDetail = item.querySelector('.route-detail');
            const hasEstimate = item.querySelector('.route-estimate');

            if (hasDetail && !hasEstimate) {
                // 移除详细路径，恢复估算信息
                hasDetail.remove();

                const distanceInKm = (item.querySelector('span[style*="color: #e74c3c"]')?.textContent?.replace(' km', '') || '1.0');
                const estimatedDrivingTime = Math.round(parseFloat(distanceInKm) * 3);
                const estimatedRidingTime = Math.round(parseFloat(distanceInKm) * 5);

                const estimateEl = document.createElement('div');
                estimateEl.className = 'route-estimate';
                estimateEl.style.marginTop = '6px';
                estimateEl.style.fontSize = '11px';
                estimateEl.style.color = '#666';
                estimateEl.innerHTML = `
                    <span style="color: #1890ff;">🚗 ~${estimatedDrivingTime}分钟</span>
                    <span style="margin-left: 10px; color: #52c41a;">🚴 ~${estimatedRidingTime}分钟</span>
                    <div style="color: #999; font-size: 10px; margin-top: 2px;">点击查看详细路径</div>
                `;
                item.appendChild(estimateEl);
            }

            // 恢复其他项的样式
            if (index < 3) {
                item.style.background = 'linear-gradient(135deg, #ffffff, #f8f9ff)';
                item.style.borderLeft = '3px solid #1890ff';
            } else {
                item.style.background = '';
                item.style.borderLeft = 'none';
            }
        }
    });
}

// 显示加载状态
function showLoading(message) {
    let loadingEl = document.getElementById('loading');
    if (!loadingEl) {
        loadingEl = document.createElement('div');
        loadingEl.id = 'loading';
        loadingEl.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 20px;
            border-radius: 8px;
            z-index: 1000;
            font-size: 14px;
        `;
        document.body.appendChild(loadingEl);
    }
    loadingEl.textContent = message;
    loadingEl.style.display = 'block';
}

// 隐藏加载状态
function hideLoading() {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        loadingEl.style.display = 'none';
    }
}

// 调整地图视野
function adjustMapView(station) {
    if (currentCircle && map) {
        // 获取圆圈的边界并适当扩大
        const bounds = currentCircle.getBounds();
        // 扩大边界，确保圆圈完全可见且有一定边距
        map.setBounds(bounds, true, [80, 80, 80, 350]);
    } else if (station) {
        // 如果没有圆圈，直接定位到站点
        map.setCenter([station.lng, station.lat]);
        map.setZoom(14);
    }
}


// 修改清除覆盖物的函数，确保路径也被清除
function clearPreviousCoverage() {
    console.log('清除之前的所有覆盖物');

    if (currentCircle && map) {
        map.remove(currentCircle);
        currentCircle = null;
    }

    hospitalMarkers.forEach(marker => {
        if (map) map.remove(marker);
    });
    hospitalMarkers = [];

    // 清除路径
    clearCurrentRoutes();

    // 清除其他可能存在的路径
    if (routePolylines && routePolylines.length > 0) {
        routePolylines.forEach(polyline => {
            if (map) map.remove(polyline);
        });
        routePolylines = [];
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM加载完成，开始加载高德地图API...');

    // 动态加载高德地图API - 添加路径规划插件
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${apiKey}&plugin=AMap.Driving,AMap.Riding`;

    script.onload = function() {
        console.log('高德地图API加载成功');
        initMap();
    };

    script.onerror = function(error) {
        console.error('高德地图API加载失败:', error);
        alert('高德地图API加载失败，请检查：\n1. API Key是否正确\n2. 网络连接是否正常\n3. 安全密钥配置');
    };

    document.head.appendChild(script);
});

// 添加键盘快捷键支持
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        clearPreviousCoverage();
        // 清除所有高亮
        subwayMarkers.forEach(marker => {
            marker.setIcon(createSubwayIcon(false));
        });

        const stationNameEl = document.getElementById('station-name');
        const stationLinesEl = document.getElementById('station-lines');
        const countElement = document.getElementById('hospital-count');
        const listElement = document.getElementById('hospital-list');
        const searchInput = document.getElementById('station-search');

        if (stationNameEl) stationNameEl.textContent = '请点击地图上的地铁站';
        if (stationLinesEl) stationLinesEl.textContent = '';
        if (countElement) countElement.textContent = '0';
        if (listElement) listElement.innerHTML = '';
        if (searchInput) searchInput.value = '';
    }
});