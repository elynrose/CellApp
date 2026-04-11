import React, { useState, useEffect, useRef } from 'react';
import { X, User, Save, Upload, Eye, EyeOff, Key, TestTube } from 'lucide-react';
import { motion } from 'framer-motion';
import { getUserProfile, updateUserProfile } from '../firebase/firestore';
import { uploadProfilePhoto } from '../firebase/storage';
import { deleteField } from 'firebase/firestore';
import { testProviderApiKey } from '../api';

const KEY_PLACEHOLDER = '••••••••••••••••••••';

const defaultProviderForm = () => ({
    openrouter: '',
    grok: '',
    gemini: '',
    fal: '',
    lmStudio: { baseUrl: 'http://127.0.0.1:1234', apiKey: '' },
    ollama: { baseUrl: 'http://127.0.0.1:11434' }
});

const UserProfile = ({ user, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [address, setAddress] = useState('');
    const [profilePhotoUrl, setProfilePhotoUrl] = useState(user?.photoURL || '');
    const [openaiApiKey, setOpenaiApiKey] = useState('');
    const [showOpenAiKey, setShowOpenAiKey] = useState(false);
    const [hadOpenAiKey, setHadOpenAiKey] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);

    const [providerForm, setProviderForm] = useState(defaultProviderForm);
    const [hadProviderKey, setHadProviderKey] = useState({
        openrouter: false,
        grok: false,
        gemini: false,
        fal: false,
        lmStudioApi: false
    });
    const [showProviderKey, setShowProviderKey] = useState({});
    const initialProviderApiKeysRef = useRef(null);
    const [testingProvider, setTestingProvider] = useState(null);

    useEffect(() => {
        if (user) {
            loadProfile();
        }
    }, [user]);

    const loadProfile = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const result = await getUserProfile(user.uid);
            if (result.success && result.data) {
                const profile = result.data;
                setFirstName(profile.firstName || '');
                setLastName(profile.lastName || '');
                setPhoneNumber(profile.phoneNumber || '');
                setAddress(profile.address || '');
                setProfilePhotoUrl(profile.profilePhotoUrl || user.photoURL || '');
                const hasOpenAi = !!profile.openaiApiKey;
                setHadOpenAiKey(hasOpenAi);
                setOpenaiApiKey(hasOpenAi ? KEY_PLACEHOLDER : '');

                const pa = profile.providerApiKeys || {};
                initialProviderApiKeysRef.current = { ...pa };

                setProviderForm({
                    openrouter: pa.openrouter ? KEY_PLACEHOLDER : '',
                    grok: pa.grok ? KEY_PLACEHOLDER : '',
                    gemini: pa.gemini ? KEY_PLACEHOLDER : '',
                    fal: pa.fal ? KEY_PLACEHOLDER : '',
                    lmStudio: {
                        baseUrl: pa.lmStudio?.baseUrl || 'http://127.0.0.1:1234',
                        apiKey: pa.lmStudio?.apiKey ? KEY_PLACEHOLDER : ''
                    },
                    ollama: {
                        baseUrl: pa.ollama?.baseUrl || 'http://127.0.0.1:11434'
                    }
                });
                setHadProviderKey({
                    openrouter: !!pa.openrouter,
                    grok: !!pa.grok,
                    gemini: !!pa.gemini,
                    fal: !!pa.fal,
                    lmStudioApi: !!pa.lmStudio?.apiKey
                });
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('Please select an image file');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setError('Image size must be less than 5MB');
            return;
        }

        setUploadingPhoto(true);
        setError(null);
        try {
            const result = await uploadProfilePhoto(file, user.uid);
            if (result.success) {
                setProfilePhotoUrl(result.url);
                setSuccess('Profile photo uploaded successfully');
                setTimeout(() => setSuccess(null), 3000);
            } else {
                setError(result.error || 'Failed to upload photo');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setUploadingPhoto(false);
        }
    };

    const isMasked = (v) => typeof v === 'string' && v.startsWith('•');

    const buildProviderApiKeysPayload = () => {
        const initial = initialProviderApiKeysRef.current || {};
        const out = {};

        ['openrouter', 'grok', 'gemini', 'fal'].forEach((id) => {
            const v = providerForm[id];
            if (!v || !String(v).trim()) {
                return;
            }
            if (isMasked(v)) {
                if (initial[id]) {
                    out[id] = initial[id];
                }
            } else {
                out[id] = String(v).trim();
            }
        });

        out.lmStudio = {
            baseUrl: (providerForm.lmStudio.baseUrl || 'http://127.0.0.1:1234').trim()
        };
        const lmKey = providerForm.lmStudio.apiKey;
        if (lmKey && !isMasked(lmKey)) {
            out.lmStudio.apiKey = lmKey.trim();
        } else if (isMasked(lmKey) && initial.lmStudio?.apiKey) {
            out.lmStudio.apiKey = initial.lmStudio.apiKey;
        }

        out.ollama = {
            baseUrl: (providerForm.ollama.baseUrl || 'http://127.0.0.1:11434').trim()
        };

        return out;
    };

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            let apiKeyUpdate = {};
            const openAiEmpty = !openaiApiKey || openaiApiKey.trim() === '';
            if (openAiEmpty && hadOpenAiKey) {
                apiKeyUpdate.openaiApiKey = deleteField();
            } else if (!openAiEmpty && !isMasked(openaiApiKey)) {
                apiKeyUpdate.openaiApiKey = openaiApiKey.trim();
            }

            const profileData = {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                phoneNumber: phoneNumber.trim(),
                address: address.trim(),
                profilePhotoUrl: profilePhotoUrl,
                providerApiKeys: buildProviderApiKeysPayload(),
                ...apiKeyUpdate
            };

            const result = await updateUserProfile(user.uid, profileData);
            if (result.success) {
                initialProviderApiKeysRef.current = profileData.providerApiKeys;
                setSuccess('Profile updated successfully');
                setTimeout(() => {
                    setSuccess(null);
                    onClose();
                }, 1500);
            } else {
                setError(result.error || 'Failed to update profile');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleShowKey = (id) => {
        setShowProviderKey((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const runKeyTest = async (which) => {
        setError(null);
        setSuccess(null);
        setTestingProvider(which);
        try {
            let r;
            if (which === 'openai') {
                const v = openaiApiKey.trim();
                if (!v || isMasked(v)) {
                    setError('Paste your OpenAI key to test (replace the masked placeholder).');
                    return;
                }
                r = await testProviderApiKey('openai', v);
            } else if (which === 'lmstudio') {
                const base = providerForm.lmStudio.baseUrl?.trim();
                if (!base) {
                    setError('Enter LM Studio base URL.');
                    return;
                }
                let k = (providerForm.lmStudio.apiKey || '').trim();
                if (isMasked(k)) k = '';
                r = await testProviderApiKey('lmstudio', k, { baseUrl: base });
            } else if (which === 'ollama') {
                const base = providerForm.ollama.baseUrl?.trim();
                if (!base) {
                    setError('Enter Ollama base URL.');
                    return;
                }
                r = await testProviderApiKey('ollama', '', { baseUrl: base });
            } else {
                const v = (providerForm[which] || '').trim();
                if (!v || isMasked(v)) {
                    setError('Paste a key to test (replace the masked placeholder).');
                    return;
                }
                r = await testProviderApiKey(which, v);
            }
            if (r.success) {
                setSuccess(r.message || 'Key is valid.');
                setTimeout(() => setSuccess(null), 5000);
            } else {
                setError(r.error || 'Test failed.');
            }
        } catch (err) {
            setError(err.message || 'Test failed.');
        } finally {
            setTestingProvider(null);
        }
    };

    const providerRows = [
        { id: 'openrouter', label: 'OpenRouter', hint: 'OpenAI-compatible gateway; model ids often look like openrouter/...' },
        { id: 'grok', label: 'xAI (Grok)', hint: 'API key from x.ai / console.x.ai' },
        { id: 'gemini', label: 'Google Gemini', hint: 'Used for Gemini / Imagen when running on the server' },
        { id: 'fal', label: 'Fal', hint: 'Stored for Fal image/video workflows (server routes vary by model)' }
    ];

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center">
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600 dark:text-gray-400">Loading profile...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            >
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            <User className="w-6 h-6 text-blue-500" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">User Profile</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Manage your profile and API providers</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-500"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {success && (
                        <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg text-sm">
                            {success}
                        </div>
                    )}
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col items-center gap-4">
                        <div className="relative">
                            {profilePhotoUrl ? (
                                <img
                                    src={profilePhotoUrl}
                                    alt="Profile"
                                    className="w-24 h-24 rounded-full object-cover border-4 border-blue-500/20"
                                />
                            ) : (
                                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold border-4 border-blue-500/20">
                                    {(firstName || lastName || user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
                                </div>
                            )}
                            <label className="absolute bottom-0 right-0 p-2 bg-blue-500 rounded-full cursor-pointer hover:bg-blue-600 transition-colors shadow-lg">
                                <Upload className="w-4 h-4 text-white" />
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handlePhotoUpload}
                                    className="hidden"
                                    disabled={uploadingPhoto}
                                />
                            </label>
                        </div>
                        {uploadingPhoto && (
                            <p className="text-sm text-gray-500">Uploading photo...</p>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                First Name
                            </label>
                            <input
                                type="text"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Enter first name"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Last Name
                            </label>
                            <input
                                type="text"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Enter last name"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Email
                        </label>
                        <input
                            type="email"
                            value={user?.email || ''}
                            disabled
                            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 cursor-not-allowed"
                        />
                        <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Phone Number
                        </label>
                        <input
                            type="tel"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter phone number"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Address
                        </label>
                        <textarea
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            rows={3}
                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                            placeholder="Enter address"
                        />
                    </div>

                    <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                            <Key className="w-4 h-4" />
                            API providers
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                            Keys are stored on your account and used when you run cells that target these providers. OpenAI pool access may still require Pro when using shared keys.
                        </p>

                        <div className="mb-6">
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                    <Key className="w-4 h-4" />
                                    OpenAI (optional)
                                </label>
                                <button
                                    type="button"
                                    onClick={() => runKeyTest('openai')}
                                    disabled={!!testingProvider}
                                    className="text-xs px-2 py-1 rounded-md border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 inline-flex items-center gap-1"
                                >
                                    <TestTube className="w-3.5 h-3.5" />
                                    {testingProvider === 'openai' ? '…' : 'Test'}
                                </button>
                            </div>
                            <div className="relative">
                                <input
                                    type={showOpenAiKey ? 'text' : 'password'}
                                    value={openaiApiKey}
                                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                                    placeholder="sk-..."
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowOpenAiKey(!showOpenAiKey)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                >
                                    {showOpenAiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                If set, your OpenAI key is used for OpenAI models. Clear the field and save to remove it.
                            </p>
                        </div>

                        <div className="space-y-4">
                            {providerRows.map((row) => (
                                <div key={row.id}>
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            {row.label}
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => runKeyTest(row.id)}
                                            disabled={!!testingProvider}
                                            className="text-xs px-2 py-1 rounded-md border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 inline-flex items-center gap-1"
                                        >
                                            <TestTube className="w-3.5 h-3.5" />
                                            {testingProvider === row.id ? '…' : 'Test'}
                                        </button>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type={showProviderKey[row.id] ? 'text' : 'password'}
                                            value={providerForm[row.id]}
                                            onChange={(e) =>
                                                setProviderForm((prev) => ({ ...prev, [row.id]: e.target.value }))
                                            }
                                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white font-mono text-sm pr-10"
                                            placeholder={hadProviderKey[row.id] ? 'Enter new key to replace' : 'API key'}
                                            autoComplete="off"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => toggleShowKey(row.id)}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                        >
                                            {showProviderKey[row.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">{row.hint}</p>
                                </div>
                            ))}

                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">LM Studio (local)</p>
                                    <button
                                        type="button"
                                        onClick={() => runKeyTest('lmstudio')}
                                        disabled={!!testingProvider}
                                        className="text-xs px-2 py-1 rounded-md border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 inline-flex items-center gap-1"
                                    >
                                        <TestTube className="w-3.5 h-3.5" />
                                        {testingProvider === 'lmstudio' ? '…' : 'Test'}
                                    </button>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Base URL</label>
                                    <input
                                        type="url"
                                        value={providerForm.lmStudio.baseUrl}
                                        onChange={(e) =>
                                            setProviderForm((prev) => ({
                                                ...prev,
                                                lmStudio: { ...prev.lmStudio, baseUrl: e.target.value }
                                            }))
                                        }
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">API key (optional)</label>
                                    <div className="relative">
                                        <input
                                            type={showProviderKey.lmstudio ? 'text' : 'password'}
                                            value={providerForm.lmStudio.apiKey}
                                            onChange={(e) =>
                                                setProviderForm((prev) => ({
                                                    ...prev,
                                                    lmStudio: { ...prev.lmStudio, apiKey: e.target.value }
                                                }))
                                            }
                                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-mono pr-10"
                                            autoComplete="off"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => toggleShowKey('lmstudio')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                        >
                                            {showProviderKey.lmstudio ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500">
                                    OpenAI-compatible server (default http://127.0.0.1:1234). Use a model id that includes lmstudio in the name or set provider on the model.
                                </p>
                            </div>

                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Ollama (local)</p>
                                    <button
                                        type="button"
                                        onClick={() => runKeyTest('ollama')}
                                        disabled={!!testingProvider}
                                        className="text-xs px-2 py-1 rounded-md border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 inline-flex items-center gap-1"
                                    >
                                        <TestTube className="w-3.5 h-3.5" />
                                        {testingProvider === 'ollama' ? '…' : 'Test'}
                                    </button>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Base URL</label>
                                    <input
                                        type="url"
                                        value={providerForm.ollama.baseUrl}
                                        onChange={(e) =>
                                            setProviderForm((prev) => ({
                                                ...prev,
                                                ollama: { baseUrl: e.target.value }
                                            }))
                                        }
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-mono"
                                    />
                                </div>
                                <p className="text-xs text-gray-500">
                                    Use model ids like <code className="font-mono">ollama:llama3</code> so the server routes to your Ollama instance.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default UserProfile;
