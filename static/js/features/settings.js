import { appState } from '../state.js';
import { EL, showToast, showConfirm } from '../utils/dom.js';
import { apiFetch } from '../api/backend.js';
import { sendGAEvent } from '../utils/analytics.js';
import { refreshAllAccountDropdowns } from '../api/zaim.js';

/**
 * Render list of linked Zaim accounts
 */
export const renderZaimAccountsList = () => {
    EL.zaimAccountsList.innerHTML = '';

    if (appState.accounts.length === 0) {
        EL.zaimAccountsList.innerHTML = '<p class="text-xs text-gray-400 italic py-2">アカウントが登録されていません。</p>';
        return;
    }

    appState.accounts.forEach(acc => {
        const item = document.createElement('div');
        item.className = 'p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600 flex justify-between items-center group cursor-pointer hover:border-blue-500 transition-all';
        item.innerHTML = `
            <div class="flex items-center">
                <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-3 text-blue-600 dark:text-blue-400">
                    <i class="fa-solid fa-user-check text-xs"></i>
                </div>
                <span class="text-sm font-medium text-gray-700 dark:text-gray-200">${acc.name}</span>
            </div>
            <i class="fa-solid fa-chevron-right text-xs text-gray-400 group-hover:translate-x-1 transition-transform"></i>
        `;
        item.onclick = () => editExternalAccount(acc.id);
        EL.zaimAccountsList.appendChild(item);
    });
};

/**
 * Edit an existing Zaim account
 */
export const editExternalAccount = async (id) => {
    appState.editingAccountId = id;
    const acc = appState.accounts.find(a => a.id == id);
    EL.zaimAccountName.value = acc ? acc.name : "";

    EL.zaimFormContainer.classList.remove('hidden');
    EL.btnZaimConnect.parentElement.classList.add('hidden');

    EL.zaimButtonsContainer.classList.remove('hidden');
    EL.btnSaveZaimCreds.classList.remove('hidden');
    EL.btnDeleteCreds.classList.remove('hidden');
    EL.zaimAccountsList.parentElement.classList.add('hidden');
};

export const updateZaimCloseButtonVisibility = () => {
    EL.btnCloseCreds.classList.remove('hidden');
};

/**
 * Open Zaim Credentials Modal
 */
export const openZaimSettings = async () => {
    appState.editingAccountId = null;
    await refreshAllAccountDropdowns();
    renderZaimAccountsList();

    // Reset form
    EL.zaimAccountName.value = "";

    EL.zaimFormContainer.classList.add('hidden');
    EL.zaimButtonsContainer.classList.remove('hidden');
    EL.btnSaveZaimCreds.classList.add('hidden');
    EL.btnDeleteCreds.classList.add('hidden');
    EL.zaimAccountsList.parentElement.classList.remove('hidden');

    updateZaimCloseButtonVisibility();

    EL.zaimCredsModal.classList.remove('hidden');
    setTimeout(() => {
        EL.zaimCredsModal.classList.remove('opacity-0');
        EL.zaimCredsModal.classList.add('opacity-100');
    }, 10);
};

export const closeZaimSettings = () => {
    EL.zaimCredsModal.classList.replace('opacity-100', 'opacity-0');
    setTimeout(() => {
        EL.zaimCredsModal.classList.add('hidden');
    }, 300);
};

export const closeSettingsDropdown = () => {
    EL.settingsDropdown.classList.remove('opacity-100', 'scale-100');
    EL.settingsDropdown.classList.add('opacity-0', 'scale-95');
    setTimeout(() => {
        EL.settingsDropdown.classList.add('hidden');
    }, 200);
};

// --- Gemini Settings ---
export const openGeminiSettings = async () => {
    // Reset form
    EL.geminiApiKey.value = "";
    EL.geminiKeyStatus.textContent = "状態: 取得中...";
    EL.geminiKeyStatus.className = "text-sm font-bold mt-2 text-gray-500";

    try {
        const response = await apiFetch(`/api/gemini/credentials`);
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();

        if (data.is_configured) {
            EL.geminiKeyStatus.textContent = `状態: 設定済み (末尾: ${data.api_key_last_4})`;
            EL.geminiKeyStatus.className = "text-sm font-bold mt-2 text-green-600 dark:text-green-400";
        } else {
            EL.geminiKeyStatus.textContent = "状態: 未設定";
            EL.geminiKeyStatus.className = "text-sm font-bold mt-2 text-red-600 dark:text-red-400";
        }
    } catch (e) {
        console.error("Failed to load Gemini config", e);
        EL.geminiKeyStatus.textContent = "状態: 確認失敗";
    }

    EL.geminiCredsModal.classList.remove('hidden');
    setTimeout(() => {
        EL.geminiCredsModal.classList.remove('opacity-0');
        EL.geminiCredsModal.classList.add('opacity-100');
    }, 10);
};

export const closeGeminiSettings = () => {
    EL.geminiCredsModal.classList.replace('opacity-100', 'opacity-0');
    setTimeout(() => {
        EL.geminiCredsModal.classList.add('hidden');
    }, 300);
};

/**
 * Initialize all Settings feature event listeners
 */
export const initSettingsFeatures = () => {
    EL.zaimCredsModal.addEventListener('click', (e) => {
        if (e.target === EL.zaimCredsModal) closeZaimSettings();
    });

    EL.btnZaimSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Close avatar dropdown if open (delegated via main.js usually, but here for direct flow)
        if (EL.avatarDropdown && !EL.avatarDropdown.classList.contains('hidden')) {
            EL.avatarDropdown.classList.remove('opacity-100', 'scale-100');
            EL.avatarDropdown.classList.add('opacity-0', 'scale-95');
            setTimeout(() => EL.avatarDropdown.classList.add('hidden'), 200);
        }
        if (EL.bulkMenuDropdown) EL.bulkMenuDropdown.classList.remove('show');

        const isHidden = EL.settingsDropdown.classList.contains('hidden');
        if (isHidden) {
            EL.settingsDropdown.classList.remove('hidden');
            sendGAEvent('open_settings');
            setTimeout(() => {
                EL.settingsDropdown.classList.remove('opacity-0', 'scale-95');
                EL.settingsDropdown.classList.add('opacity-100', 'scale-100');
            }, 10);
        } else {
            closeSettingsDropdown();
        }
    });

    document.addEventListener('click', (e) => {
        if (!EL.settingsDropdown.contains(e.target) && e.target !== EL.btnZaimSettings) {
            closeSettingsDropdown();
        }
    });

    EL.menuItemZaimCreds.addEventListener('click', () => {
        closeSettingsDropdown();
        openZaimSettings();
    });

    EL.menuItemGeminiCreds.addEventListener('click', () => {
        closeSettingsDropdown();
        openGeminiSettings();
    });

    EL.btnCloseGeminiCreds.addEventListener('click', closeGeminiSettings);
    EL.btnCancelGeminiCreds.addEventListener('click', closeGeminiSettings);
    EL.geminiCredsModal.addEventListener('click', (e) => {
        if (e.target === EL.geminiCredsModal) closeGeminiSettings();
    });

    EL.btnSaveGeminiCreds.addEventListener('click', async () => {
        const apiKey = EL.geminiApiKey.value.trim();
        if (!apiKey) {
            showToast("APIキーを入力してください。", 'warning');
            return;
        }

        const btnOriginalText = EL.btnSaveGeminiCreds.innerHTML;
        EL.btnSaveGeminiCreds.disabled = true;
        EL.btnSaveGeminiCreds.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> 保存中...';

        try {
            const res = await apiFetch('/api/gemini/credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gemini_api_key: apiKey })
            });
            if (!res.ok) throw new Error(await res.text());

            showToast("Gemini APIキーを保存しました。");
            sendGAEvent('gemini_key_saved');
            closeGeminiSettings();
        } catch (e) {
            console.error(e);
            showToast("APIキーの保存に失敗しました: " + e.message, 'error');
        } finally {
            EL.btnSaveGeminiCreds.disabled = false;
            EL.btnSaveGeminiCreds.innerHTML = btnOriginalText;
        }
    });

    EL.btnDeleteGeminiCreds.addEventListener('click', async () => {
        if (!await showConfirm("削除の確認", "Gemini APIキーを削除しますか？これ以降の解析はできなくなります。")) return;

        try {
            const resp = await apiFetch(`/api/gemini/credentials`, { method: 'DELETE' });
            if (!resp.ok) throw new Error(await resp.text());
            showToast("Gemini APIキーを削除しました。");
            closeGeminiSettings();
        } catch (e) {
            showToast("削除に失敗しました: " + e.message, 'error');
        }
    });

    EL.btnCloseCreds.addEventListener('click', closeZaimSettings);
    EL.btnCancelCreds.addEventListener('click', () => {
        const isFormVisible = !EL.zaimFormContainer.classList.contains('hidden');
        if (isFormVisible && appState.accounts.length > 0) {
            EL.zaimFormContainer.classList.add('hidden');
            EL.zaimButtonsContainer.classList.add('hidden');
            EL.zaimAccountsList.parentElement.classList.remove('hidden');
        } else {
            closeZaimSettings();
        }
    });

    EL.btnAddNewAccount.addEventListener('click', () => {
        appState.editingAccountId = null;
        EL.zaimAccountName.value = "";
        EL.zaimFormContainer.classList.remove('hidden');
        EL.btnZaimConnect.parentElement.classList.remove('hidden');
        EL.zaimButtonsContainer.classList.remove('hidden');
        EL.btnSaveZaimCreds.classList.add('hidden');
        EL.btnDeleteCreds.classList.add('hidden');
        EL.zaimAccountsList.parentElement.classList.add('hidden');
    });

    EL.btnZaimConnect.addEventListener('click', async () => {
        const name = EL.zaimAccountName.value.trim() || "Zaim Account";
        const btnOriginalText = EL.btnZaimConnect.innerHTML;
        EL.btnZaimConnect.disabled = true;
        EL.btnZaimConnect.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> 連携中...';

        try {
            const res = await apiFetch(`/api/zaim/login?name=${encodeURIComponent(name)}`);
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            if (data.auth_url) {
                sessionStorage.setItem('zaim_auth_pending', 'true');
                window.location.href = data.auth_url;
            } else {
                throw new Error("Invalid response from server. No auth_url found.");
            }
        } catch (e) {
            console.error(e);
            showToast("連携の開始に失敗しました: " + e.message, 'error');
            EL.btnZaimConnect.disabled = false;
            EL.btnZaimConnect.innerHTML = btnOriginalText;
        }
    });

    EL.btnSaveZaimCreds.addEventListener('click', async () => {
        if (!appState.editingAccountId) return;
        const newName = EL.zaimAccountName.value.trim();
        if (!newName) {
            showToast("表示名を入力してください。", 'warning');
            return;
        }

        const btnOriginalText = EL.btnSaveZaimCreds.innerHTML;
        EL.btnSaveZaimCreds.disabled = true;
        EL.btnSaveZaimCreds.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> 保存中...';

        try {
            const resp = await apiFetch(`/api/zaim/credentials/${appState.editingAccountId}/name`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
            if (!resp.ok) throw new Error(await resp.text());

            showToast("表示名を変更しました。");
            await refreshAllAccountDropdowns();
            renderZaimAccountsList();

            EL.zaimFormContainer.classList.add('hidden');
            EL.btnSaveZaimCreds.classList.add('hidden');
            EL.btnDeleteCreds.classList.add('hidden');
            EL.zaimAccountsList.parentElement.classList.remove('hidden');
            updateZaimCloseButtonVisibility();
        } catch (e) {
            console.error(e);
            showToast("保存に失敗しました: " + e.message, 'error');
        } finally {
            EL.btnSaveZaimCreds.disabled = false;
            EL.btnSaveZaimCreds.innerHTML = btnOriginalText;
        }
    });

    EL.btnDeleteCreds.addEventListener('click', async () => {
        if (!appState.editingAccountId) return;
        if (!await showConfirm("連携解除の確認", "このZaimアカウントとの連携を解除しますか？")) return;

        try {
            const resp = await apiFetch(`/api/zaim/disconnect/${appState.editingAccountId}`, {
                method: 'DELETE'
            });
            if (!resp.ok) throw new Error(await resp.text());

            showToast("連携を解除しました。");
            await refreshAllAccountDropdowns();
            renderZaimAccountsList();

            EL.zaimFormContainer.classList.add('hidden');
            EL.zaimAccountsList.parentElement.classList.remove('hidden');
            updateZaimCloseButtonVisibility();
        } catch (e) {
            showToast("解除に失敗しました: " + e.message, 'error');
        }
    });

    const copyGuideUrl = () => {
        const url = "https://note.com/logic_prompt/n/n9b49739594ca";
        navigator.clipboard.writeText(url).then(() => {
            showToast("セットアップガイドのURLをコピーしました。", 'success');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            showToast("URLのコピーに失敗しました。", 'error');
        });
    };

    if (EL.btnCopyGuideZaim) EL.btnCopyGuideZaim.addEventListener('click', copyGuideUrl);
    if (EL.btnCopyGuideGemini) EL.btnCopyGuideGemini.addEventListener('click', copyGuideUrl);
};
