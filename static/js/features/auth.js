import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { appState } from '../state.js';
import { EL, showToast, showConfirm } from '../utils/dom.js';

let auth;

/**
 * Avatar Dropdown Toggle
 */
export const closeAvatarDropdown = () => {
    if (!EL.avatarDropdown.classList.contains('hidden')) {
        EL.avatarDropdown.classList.remove('opacity-100', 'scale-100');
        EL.avatarDropdown.classList.add('opacity-0', 'scale-95');
        setTimeout(() => EL.avatarDropdown.classList.add('hidden'), 200);
    }
};

/**
 * Initialize Firebase Auth
 * @param {Object} callbacks - Functions to call for specific logic that lives in other modules
 */
export const initFirebaseAuth = async (callbacks = {}) => {
    const { 
        loadAccounts, 
        loadTargetAccounts, 
        loadZaimAccounts, 
        openZaimSettings, 
        closeSettingsDropdown 
    } = callbacks;

    // Hide splash screen as soon as initialization logic starts
    if (EL.splashScreen) {
        EL.splashScreen.style.opacity = '0';
        EL.splashScreen.style.pointerEvents = 'none'; // Unblock UI immediately
        setTimeout(() => {
            EL.splashScreen.classList.add('hidden');
            EL.splashScreen.style.display = 'none'; // Ensure display:none overrides inline flex
        }, 300);
    }

    const setupFirebase = (config) => {
        const fireApp = initializeApp(config);
        auth = getAuth(fireApp);
        const provider = new GoogleAuthProvider();

        EL.btnGoogleLogin.addEventListener('click', async () => {
            try {
                EL.btnGoogleLogin.disabled = true;
                EL.btnGoogleLogin.innerHTML = `
                    <div class="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-gray-600 mr-3"></div>
                    <span>ログイン処理中...</span>
                `;
                await signInWithPopup(auth, provider);
            } catch (error) {
                console.error("Login failed", error);
                showToast("ログインに失敗しました: " + error.message, 'error');
                EL.btnGoogleLogin.disabled = false;
                EL.btnGoogleLogin.innerHTML = `
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" class="w-6 h-6">
                    <span>Googleでログイン</span>
                `;
            }
        });

        EL.btnUserAvatar.addEventListener('click', (e) => {
            e.stopPropagation();
            if (closeSettingsDropdown) closeSettingsDropdown();
            if (EL.bulkMenuDropdown) EL.bulkMenuDropdown.classList.remove('show');
            
            const dropdown = EL.avatarDropdown;
            if (dropdown.classList.contains('hidden')) {
                dropdown.classList.remove('hidden');
                setTimeout(() => {
                    dropdown.classList.remove('opacity-0', 'scale-95');
                    dropdown.classList.add('opacity-100', 'scale-100');
                }, 10);
            } else {
                closeAvatarDropdown();
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!EL.btnUserAvatar.contains(e.target) && !EL.avatarDropdown.contains(e.target)) {
                if (!EL.avatarDropdown.classList.contains('hidden')) {
                    closeAvatarDropdown();
                }
            }
        });

        // Logout
        EL.menuItemLogout.addEventListener('click', async () => {
            EL.avatarDropdown.classList.add('hidden');
            if (await showConfirm("ログアウト", "ログアウトしますか？")) {
                try {
                    await signOut(auth);
                } catch (error) {
                    console.error("Logout failed", error);
                }
            }
        });

        // Delete Account
        EL.menuItemDeleteAccount.addEventListener('click', async () => {
            EL.avatarDropdown.classList.add('hidden');
            const confirmMsg = "本当にアカウントを削除しますか？\n設定したすべての連携情報や履歴データが完全に消去され、元に戻すことはできません。";
            if (await showConfirm("アカウント削除の警告", confirmMsg)) {
                try {
                    showToast("アカウントを削除しています...", "info");
                    const res = await fetch('/api/user', {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${appState.idToken}`
                        }
                    });
                    if (!res.ok) throw new Error(`Failed to delete backend data: ${res.statusText}`);
                    const user = auth.currentUser;
                    if (user) {
                        import('https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js').then(async (module) => {
                            const { deleteUser } = module;
                            await deleteUser(user);
                            showToast("アカウントを正常に削除しました", "success");
                        });
                    }
                } catch (error) {
                    console.error("Account deletion failed", error);
                    if (error.code === 'auth/requires-recent-login') {
                        showToast("セキュリティのため、再度ログインしてからもう一度削除を実行してください。", "error");
                        await signOut(auth);
                    } else {
                        showToast("アカウント削除に失敗しました: " + error.message, "error");
                    }
                }
            }
        });

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // GA Opt-out logic for developers
                if (window.DEVELOPER_EMAILS && window.GA_MEASUREMENT_ID) {
                    const devEmails = window.DEVELOPER_EMAILS.split(',').map(email => email.trim());
                    if (devEmails.includes(user.email)) {
                        window['ga-disable-' + window.GA_MEASUREMENT_ID] = true;
                        console.log('Developer access detected: GA tracking disabled.');
                    }
                }

                appState.user = user;
                appState.idToken = await user.getIdToken();

                // Hide login overlay immediately - don't wait for token etc.
                if (!EL.loginOverlay.classList.contains('hidden')) {
                    EL.loginOverlay.classList.add('opacity-0');
                    EL.loginOverlay.style.pointerEvents = 'none'; // Allow clicks to pass through while fading
                    setTimeout(() => EL.loginOverlay.classList.add('hidden'), 300);
                }
                EL.userProfile.classList.remove('hidden');
                EL.btnZaimSettings.classList.remove('hidden');
                if (user.photoURL) EL.userAvatar.src = user.photoURL;

                (async () => {
                    try {
                        // Parallel load of accounts and target accounts
                        const tasks = [];
                        if (loadAccounts) tasks.push(loadAccounts());
                        if (loadTargetAccounts) tasks.push(loadTargetAccounts());

                        const results = await Promise.all(tasks);
                        const hasTarget = results[1] !== undefined ? results[1] : results[0];

                        if (hasTarget !== false) {
                            try {
                                if (loadZaimAccounts) await loadZaimAccounts();
                            } catch (loadErr) {
                                console.error("Zaim access failed:", loadErr);
                                showToast("Zaim連携に失敗しました。設定を確認してください。", "error");
                                if (openZaimSettings) openZaimSettings();
                            }
                        } else {
                            if (openZaimSettings) openZaimSettings();
                        }
                    } catch (err) {
                        console.error("Error loading accounts post-login:", err);
                    }
                })();
            } else {
                appState.user = null;
                appState.idToken = null;

                // ONLY show login overlay if auth state is confirmed negative
                EL.loginOverlay.classList.remove('hidden');
                setTimeout(() => EL.loginOverlay.classList.remove('opacity-0'), 10);
                EL.userProfile.classList.add('hidden');
                EL.btnZaimSettings.classList.add('hidden');
                EL.userAvatar.src = "";

                EL.btnGoogleLogin.disabled = false;
                EL.btnGoogleLogin.innerHTML = `
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" class="w-6 h-6">
                    <span>Googleでログイン</span>
                `;
            }
        });
    };

    // Try to get config from cache first for instant initialization
    const cachedConfig = localStorage.getItem('firebaseConfig');
    if (cachedConfig) {
        try {
            setupFirebase(JSON.parse(cachedConfig));
            // Still fetch fresh config in background to ensure it's up to date
            fetch('/api/config').then(res => res.json()).then(data => {
                localStorage.setItem('firebaseConfig', JSON.stringify(data.firebaseConfig));
            }).catch(() => {});
            return;
        } catch (e) {
            console.error("Failed to parse cached firebase config", e);
        }
    }

    // No cache or failed cache: fetch from API
    try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error("Failed to fetch Firebase config");
        const { firebaseConfig } = await res.json();
        localStorage.setItem('firebaseConfig', JSON.stringify(firebaseConfig));
        setupFirebase(firebaseConfig);
    } catch (e) {
        console.error("Error initializing Firebase Auth:", e);
        showToast("システムの設定エラーによりログイン機能が起動できませんでした。", 'error');
    }
};
