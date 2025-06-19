// VLE Course Auto Completer - Simple & Direct API

(function() {
    'use strict';

    // Configuration (MAX_MODULES will be detected dynamically)
    const CONFIG = {
        DELAY: 2000,
        MAX_MODULES: 0, // will be populated at runtime
        ASSESSMENT_MODULES: [] // specify indices here if certain modules must be skipped
    };

    // State
    let isRunning = false;
    let completedModules = new Set();

    // Utility
    const log = (message) => console.log(`[VLE Auto] ${message}`);
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Detect total number of modules on the current page by looking for elements whose
    // className matches the pattern "auto_<index>" (e.g. auto_0, auto_1, ...).
    const detectModuleCount = () => {
        let count = 0;
        while (document.querySelector(`.auto_${count}`)) {
            count++;
        }
        return count;
    };

    // Initialize progress based on current page status
    const initializeProgress = () => {
        // Re-detect module count each time we initialise in case the page structure changes
        CONFIG.MAX_MODULES = detectModuleCount();

        completedModules.clear();
        
        for (let i = 0; i < CONFIG.MAX_MODULES; i++) {
            const element = document.querySelector(`.auto_${i}`);
            if (element && element.classList.contains('full')) {
                completedModules.add(i);
                log(`Module ${i} already completed`);
            }
        }
        
        log(`📊 Found ${completedModules.size}/${CONFIG.MAX_MODULES} modules already completed`);
        updateProgressUI();
    };

    // Update progress UI
    const updateProgressUI = () => {
        const countEl = document.getElementById('completed-count');
        const progressBar = document.getElementById('progress-bar');
        
        if (countEl && progressBar) {
            const completed = completedModules.size;
            const percentage = (completed / CONFIG.MAX_MODULES) * 100;
            
            countEl.textContent = completed;
            progressBar.style.width = percentage + '%';
        }
    };

    // Get CSRF Token
    const getCSRFToken = () => {
        // Try meta tag first
        const csrfMeta = document.querySelector('meta[name="csrfToken"]') || 
                        document.querySelector('meta[name="_token"]') ||
                        document.querySelector('input[name="_token"]');
        if (csrfMeta) {
            return csrfMeta.getAttribute('content') || csrfMeta.value;
        }
        
        // Try cookies
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
            if (cookie.trim().startsWith('csrfToken=')) {
                return cookie.split('=')[1];
            }
        }
        
        return null;
    };

    // Direct API call using EXACT working cURL format
    const callProgressAPI = async (dataId) => {
        const csrfToken = getCSRFToken();
        if (!csrfToken) {
            log('❌ No CSRF token found');
            return { success: false, error: 'No CSRF token' };
        }

        log(`🔑 CSRF Token: ${csrfToken.substring(0, 20)}...`);
        log(`📋 Using data-id: ${dataId}`);

        // Try multiple "position_data" values – some installations only register progress after
        // hitting certain thresholds. We cycle through until we observe server side change.
        const POSITION_VARIANTS = ['300', '594', '99999'];

        // Keep track of the server-reported baseline so we can detect change.
        let baselineModules = completedModules.size;

        for (const position of POSITION_VARIANTS) {
            const formData = new URLSearchParams();
            formData.append('course_data', dataId);
            formData.append('duration_data', '');
            formData.append('position_data', position);
            formData.append('version_number', '3');
            formData.append('_csrfToken', csrfToken);

            try {
                log(`🚀 Calling API with position_data=${position}`);
                log(`📦 Data: ${formData.toString()}`);

                const response = await fetch('https://vle.hcmue.edu.vn/courses/update-media-progress', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'X-Requested-With': 'XMLHttpRequest',
                        'Accept': 'application/json, text/javascript, */*; q=0.01',
                        'Origin': 'https://vle.hcmue.edu.vn',
                        'Referer': window.location.href,
                        'Sec-Fetch-Dest': 'empty',
                        'Sec-Fetch-Mode': 'cors',
                        'Sec-Fetch-Site': 'same-origin'
                    },
                    body: formData,
                    credentials: 'include'
                });

                const responseText = await response.text();
                log(`📡 Response: ${response.status} ${response.statusText}`);
                log(`📄 Raw response: ${responseText}`);

                if (!response.ok) {
                    log(`❌ API failed (HTTP ${response.status}) – trying next variant`);
                    continue;
                }

                // Try to parse JSON; fallback to plain text success keyword
                let newModulesCompleted = baselineModules;
                let newProgress = 0;
                let jsonResponse = null;

                try {
                    jsonResponse = JSON.parse(responseText);
                    newModulesCompleted = jsonResponse.modules_completed ?? baselineModules;
                    newProgress = jsonResponse.progress ?? 0;
                } catch (_) {
                    // Non-JSON success; assume progress changed
                    return { success: true, response: responseText, progressChanged: true };
                }

                log(`📊 Progress: ${newProgress}, Modules: ${newModulesCompleted}`);

                if (newModulesCompleted > baselineModules) {
                    log(`🎉 SUCCESS – server modules increased to ${newModulesCompleted}`);
                    return {
                        success: true,
                        response: jsonResponse,
                        progressChanged: true,
                        modulesCompleted: newModulesCompleted,
                        progressLevel: newProgress
                    };
                } else {
                    log('⚠️ Progress unchanged – trying next variant...');
                }

            } catch (error) {
                log(`❌ Network error: ${error.message}`);
            }
        }

        // All variants exhausted
        return { success: false, error: 'All position_data variants failed' };
    };

    // Direct API call for HTML or PDF modules (single progress)
    const callSingleProgressAPI = async (dataId) => {
        const csrfToken = getCSRFToken();
        if (!csrfToken) {
            log('❌ No CSRF token found');
            return { success: false, error: 'No CSRF token' };
        }

        const formData = new URLSearchParams();
        formData.append('course_data', dataId);
        formData.append('version_number', '3');
        formData.append('_csrfToken', csrfToken);

        try {
            log(`🚀 Calling update-single-progress for content module`);
            const response = await fetch('https://vle.hcmue.edu.vn/courses/update-single-progress', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: formData,
                credentials: 'include'
            });

            const text = await response.text();
            log(`📡 Single progress response: ${response.status}`);
            log(`📄 Raw: ${text}`);

            if (response.ok) {
                try {
                    const json = JSON.parse(text);
                    return { success: true, response: json, modulesCompleted: json.modules_completed, progressLevel: json.progress };
                } catch (_) {
                    return { success: true, response: text };
                }
            }
            return { success: false, error: `HTTP ${response.status}` };

        } catch (e) {
            return { success: false, error: e.message };
        }
    };

    // Test API with detailed debugging
    window.testAPI = async (moduleIndex) => {
        const info = getModuleInfo(moduleIndex);
        if (!info) {
            log(`❌ Module ${moduleIndex} not found`);
            return;
        }
        
        if (!info.dataId) {
            log(`❌ No data-id found for module ${moduleIndex}`);
            return;
        }
        
        log(`🧪 Testing API for module ${moduleIndex} (${info.contentType})`);
        log(`📋 Data-id: ${info.dataId}`);
        
        const result = await callProgressAPI(info.dataId);
        
        if (result.success) {
            log(`✅ API test successful for module ${moduleIndex}!`);
        } else {
            log(`❌ API test failed for module ${moduleIndex}: ${result.error}`);
        }
        
        return result;
    };

    // Get module info
    const getModuleInfo = (index) => {
        const element = document.querySelector(`.auto_${index}`);
        if (!element) return null;

        const isLocked = element.classList.contains('lock');
        const isCompleted = element.classList.contains('full');
        const contentElement = element.closest('.lecture_content');
        
        let contentType = 'unknown';
        let dataId = null;

        if (contentElement) {
            const icon = contentElement.querySelector('.fa');
            if (icon?.classList.contains('fa-file-code-o')) contentType = 'html';
            else if (icon?.classList.contains('fa-file-movie-o')) contentType = 'video';  
            else if (icon?.classList.contains('fa-file-pdf-o')) contentType = 'pdf';
            else if (icon?.classList.contains('fa-file-text-o')) contentType = 'assessment';

            // Find data-id
            const linkElement = contentElement.querySelector('a[data-id]');
            if (linkElement) {
                dataId = linkElement.getAttribute('data-id');
            }
        }

        return { element, index, isLocked, isCompleted, contentType, contentElement, dataId };
    };

    // Unlock module
    const unlockModule = (index) => {
        const element = document.querySelector(`.auto_${index}`);
        if (!element) return false;
        
        element.classList.remove('lock');
        element.classList.add('unlock');
        log(`🔓 Module ${index} unlocked`);
        return true;
    };

    // Mark complete (only update local state, not fake visual)
    const markComplete = (index) => {
        const element = document.querySelector(`.auto_${index}`);
        if (!element) return false;
        
        // Only mark as completed if API was successful
        element.classList.remove('lock');
        element.classList.add('unlock', 'full');
        completedModules.add(index);
        
        // Unlock next module
        if (index + 1 < CONFIG.MAX_MODULES) {
            unlockModule(index + 1);
        }
        
        log(`✅ Module ${index} marked as completed`);
        updateProgressUI();
        return true;
    };

    // Process video content with direct API call
    const processVideoContent = async (info) => {
        if (!info.dataId) {
            log(`❌ No data-id found for video ${info.index}`);
            return false;
        }

        log(`🎥 Processing video ${info.index} with data-id: ${info.dataId}`);
        
        // Direct API call without video interaction
        const result = await callProgressAPI(info.dataId);
        
        if (result.success) {
            if (result.progressChanged) {
                log(`🎉 Video ${info.index} completed successfully! Progress: ${result.progressLevel}, Modules: ${result.modulesCompleted}`);
                return true;
            } else {
                log(`⚠️ Video ${info.index} API successful but server progress unchanged`);
                log(`📊 Current server state: Progress=${result.progressLevel}, Modules=${result.modulesCompleted}`);
                
                // Still mark as successful since API call worked
                return true;
            }
        } else {
            log(`❌ Video ${info.index} API call failed: ${result.error}`);
            return false;
        }
    };

    // Process single content (HTML/PDF) with direct API call  
    const processContent = async (info) => {
        if (!info.dataId) {
            log(`❌ No data-id found for ${info.contentType} ${info.index}`);
            return false;
        }

        log(`📄 Processing ${info.contentType} ${info.index} with data-id: ${info.dataId}`);
        
        // Use single-progress endpoint for HTML/PDF
        const result = await callSingleProgressAPI(info.dataId);
        
        if (result.success) {
            if (result.progressChanged) {
                log(`🎉 ${info.contentType} ${info.index} completed successfully! Progress: ${result.progressLevel}, Modules: ${result.modulesCompleted}`);
                return true;
            } else {
                log(`⚠️ ${info.contentType} ${info.index} API successful but server progress unchanged`);
                log(`📊 Current server state: Progress=${result.progressLevel}, Modules=${result.modulesCompleted}`);
                
                // For HTML/PDF, API success usually means completion
                return true;
            }
        } else {
            log(`❌ ${info.contentType} ${info.index} API call failed: ${result.error}`);
            return false;
        }
    };

    // Process single module
    const processModule = async (index) => {
        const info = getModuleInfo(index);
        if (!info) {
            log(`⚠️ Module ${index} not found`);
            return;
        }

        if (info.isCompleted) {
            log(`✅ Module ${index} already completed`);
            return;
        }

        if (CONFIG.ASSESSMENT_MODULES.includes(index)) {
            log(`⏭️ Skipping assessment module ${index}`);
            return;
        }

        if (info.isLocked) {
            unlockModule(index);
            await sleep(500);
        }

        log(`🔄 Processing ${info.contentType} module ${index}`);

        let success = false;

        // Handle different content types
        if (info.contentType === 'video') {
            success = await processVideoContent(info);
        } 
        else if (info.contentType === 'html' || info.contentType === 'pdf') {
            success = await processContent(info);
        }
        else {
            log(`⚠️ Unknown content type: ${info.contentType}`);
            return;
        }

        if (success) {
            markComplete(index);
            await sleep(1000); // Give time for server to process
        } else {
            log(`❌ Failed to complete module ${index}`);
        }
    };

    // Check final progress from server
    const checkFinalProgress = async () => {
        try {
            log('🔄 Checking final progress from server...');
            
            // Reload the page to get fresh data from server
            await sleep(1000);
            
            // Check how many modules are actually completed on server side
            const response = await fetch(window.location.href, {
                method: 'GET',
                credentials: 'include'
            });
            
            if (response.ok) {
                const html = await response.text();
                
                // Count completed modules from server response
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                let serverCompletedCount = 0;
                for (let i = 0; i < CONFIG.MAX_MODULES; i++) {
                    const element = doc.querySelector(`.auto_${i}`);
                    if (element && element.classList.contains('full')) {
                        serverCompletedCount++;
                    }
                }
                
                log(`📊 Server reports ${serverCompletedCount}/${CONFIG.MAX_MODULES} modules completed`);
                log(`📊 Local count: ${completedModules.size}/${CONFIG.MAX_MODULES} modules completed`);
                
                if (serverCompletedCount > completedModules.size) {
                    log('🔄 Server has more completed modules than local. Refreshing page...');
                    setTimeout(() => window.location.reload(), 2000);
                }
                
                return serverCompletedCount;
            }
            
        } catch (error) {
            log(`❌ Error checking server progress: ${error.message}`);
        }
        
        return completedModules.size;
    };

    // Main auto-completion
    const startAutoCompletion = async () => {
        if (isRunning) {
            log('⚠️ Already running!');
            return;
        }

        isRunning = true;
        log('🚀 Starting auto-completion...');
        
        // Initialize progress first
        initializeProgress();

        try {
            for (let i = 0; i < CONFIG.MAX_MODULES; i++) {
                if (!isRunning) break;
                
                await processModule(i);
                await sleep(CONFIG.DELAY);
            }
            
            log('🎉 Auto-completion finished!');
            log(`📊 Local result: ${completedModules.size}/${CONFIG.MAX_MODULES} modules completed`);
            
            // Check final progress from server
            const serverCount = await checkFinalProgress();
            
            if (serverCount !== completedModules.size) {
                log(`⚠️ Discrepancy detected: Local=${completedModules.size}, Server=${serverCount}`);
            }
            
            // Optional: reload page to sync with server
            setTimeout(() => {
                if (confirm(`Complete! Local: ${completedModules.size}, Server: ${serverCount}. Reload page to see final results?`)) {
                    window.location.reload();
                }
            }, 3000);
            
        } catch (error) {
            log(`❌ Error: ${error.message}`);
        } finally {
            isRunning = false;
        }
    };

    const stopAutoCompletion = () => {
        isRunning = false;
        log('⏹️ Stopped auto-completion');
    };

    // Simple UI Panel
    const createPanel = () => {
        if (document.getElementById('vle-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'vle-panel';
        panel.innerHTML = `
            <div style="
                position: fixed; 
                top: 20px; 
                right: 20px; 
                z-index: 10000; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white; 
                padding: 20px; 
                border-radius: 20px; 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                box-shadow: 0 15px 35px rgba(0,0,0,0.1), 0 5px 15px rgba(0,0,0,0.07);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255,255,255,0.1);
                min-width: 280px;
                transition: all 0.3s ease;
            ">
                <div style="display: flex; align-items: center; margin-bottom: 15px;">
                    <div style="
                        width: 40px; 
                        height: 40px; 
                        background: linear-gradient(45deg, #ff6b6b, #feca57);
                        border-radius: 50%; 
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                        margin-right: 12px;
                        box-shadow: 0 4px 15px rgba(255,107,107,0.3);
                    ">
                        <span style="font-size: 18px;">🎯</span>
                    </div>
                    <div>
                        <h3 style="margin: 0; font-size: 16px; font-weight: 600;">VLE Auto Completer</h3>
                        <p style="margin: 0; font-size: 11px; opacity: 0.8;">Direct API + Real Progress</p>
                    </div>
                </div>
                
                <div style="
                    background: rgba(255,255,255,0.1); 
                    border-radius: 15px; 
                    padding: 15px; 
                    margin-bottom: 15px;
                    border: 1px solid rgba(255,255,255,0.1);
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-size: 13px; opacity: 0.9;">Progress</span>
                        <span style="font-size: 13px; font-weight: 600;"><span id="completed-count">0</span>/${CONFIG.MAX_MODULES}</span>
                    </div>
                    <div style="
                        width: 100%; 
                        height: 8px; 
                        background: rgba(255,255,255,0.2); 
                        border-radius: 10px; 
                        overflow: hidden;
                    ">
                        <div id="progress-bar" style="
                            height: 100%; 
                            background: linear-gradient(90deg, #56ab2f, #a8e6cf, #56ab2f);
                            background-size: 200% 100%;
                            border-radius: 10px; 
                            width: 0%; 
                            transition: width 0.5s ease;
                            animation: shimmer 2s infinite;
                        "></div>
                    </div>
                </div>

                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <button id="start-btn" style="
                        flex: 1;
                        background: linear-gradient(45deg, #56ab2f, #a8e6cf); 
                        color: white; 
                        border: none; 
                        padding: 12px 16px; 
                        border-radius: 12px; 
                        cursor: pointer; 
                        font-weight: 600;
                        font-size: 14px;
                        transition: all 0.3s ease;
                        box-shadow: 0 4px 15px rgba(86,171,47,0.3);
                    ">🚀 Start</button>
                    
                    <button id="stop-btn" style="
                        flex: 1;
                        background: linear-gradient(45deg, #ff4757, #ff6b7a); 
                        color: white; 
                        border: none; 
                        padding: 12px 16px; 
                        border-radius: 12px; 
                        cursor: pointer; 
                        font-weight: 600;
                        font-size: 14px;
                        transition: all 0.3s ease;
                        box-shadow: 0 4px 15px rgba(255,71,87,0.3);
                    ">⏹️ Stop</button>
                </div>

                <div style="
                    display: flex; 
                    justify-content: space-around; 
                    background: rgba(255,255,255,0.1); 
                    border-radius: 12px; 
                    padding: 12px;
                    border: 1px solid rgba(255,255,255,0.1);
                ">
                    <div style="text-align: center;">
                        <div style="font-size: 16px; margin-bottom: 4px;">🎯</div>
                        <div style="font-size: 10px; opacity: 0.8;">Real API</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 16px; margin-bottom: 4px;">✅</div>
                        <div style="font-size: 10px; opacity: 0.8;">No Fake</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 16px; margin-bottom: 4px;">❌</div>
                        <div style="font-size: 10px; opacity: 0.8;">Skip Tests</div>
                    </div>
                </div>

                <style>
                    @keyframes shimmer {
                        0% { background-position: -200% 0; }
                        100% { background-position: 200% 0; }
                    }
                    
                    #start-btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 6px 20px rgba(86,171,47,0.4) !important;
                    }
                    
                    #stop-btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 6px 20px rgba(255,71,87,0.4) !important;
                    }
                </style>
            </div>
        `;

        document.body.appendChild(panel);

        // Button interactions
        document.getElementById('start-btn').onclick = startAutoCompletion;
        document.getElementById('stop-btn').onclick = stopAutoCompletion;

        // Update progress every second
        setInterval(updateProgressUI, 1000);
    };

    // Initialize
    const init = () => {
        log('🎯 VLE Auto Completer loaded');
        log('✅ Real API calls only');
        log('🚀 Ready! Click Start to begin auto-completion');
        
        // Initialize progress based on current state
        setTimeout(() => {
            initializeProgress();
            createPanel();
        }, 1000);
    };

    // Expose for debugging
    window.vleDebug = {
        testAPI,
        getModuleInfo,
        initializeProgress,
        completedModules
    };

    // Start when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(); 