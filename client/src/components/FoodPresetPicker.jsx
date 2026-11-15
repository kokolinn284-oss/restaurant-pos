import React, { useState, useRef } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal } from './ui.jsx';
import { FOOD_PRESETS } from '../foodPresets.js';

export function ImagePickerModal({ currentImage, onSelect, onClose, showToast }) {
  const { t } = useI18n();
  const [tab, setTab] = useState('presets'); // 'presets' | 'upload' | 'url'
  const [urlInput, setUrlInput] = useState(currentImage || '');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast?.(t('ပုံဖိုင်သာ ရွေးချယ်ပါ'));
      return;
    }
    // Read and compress or send base64
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result;
        const res = await api('/upload', {
          method: 'POST',
          body: JSON.stringify({ data: base64Data, filename: file.name })
        });
        if (res.url) {
          onSelect(res.url);
          onClose();
          showToast?.(t('ပုံ တင်ပြီးပါပြီ'));
        }
      } catch (err) {
        // Fallback to direct base64 if server upload endpoint has an issue
        onSelect(reader.result);
        onClose();
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <Modal wide title={t('အစားအသောက် ဓာတ်ပုံ ရွေးချယ်ပါ')} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t('မလုပ်တော့')}</button>
      {currentImage && (
        <button className="btn danger" onClick={() => { onSelect(''); onClose(); }}>
          <Icon name="trash" size={15} /> {t('ပုံဖျက်မည်')}
        </button>
      )}
    </>}>
      <div className="tabs mb-16">
        <button className={`tab ${tab === 'presets' ? 'on' : ''}`} onClick={() => setTab('presets')}>
          <Icon name="spark" size={15} /> {t('နမူနာ အစားအသောက်ပုံများ')}
        </button>
        <button className={`tab ${tab === 'upload' ? 'on' : ''}`} onClick={() => setTab('upload')}>
          <Icon name="upload" size={15} /> {t('ဖုန်း/ကွန်ပျူတာမှ တင်မည်')}
        </button>
        <button className={`tab ${tab === 'url' ? 'on' : ''}`} onClick={() => setTab('url')}>
          <Icon name="image" size={15} /> {t('ဝဘ်ဆိုဒ် လင့်ခ် (URL)')}
        </button>
      </div>

      {tab === 'presets' && (
        <div className="preset-grid">
          {FOOD_PRESETS.map((p) => {
            const isSelected = currentImage === p.url;
            return (
              <button
                key={p.id}
                type="button"
                className={`preset-card ${isSelected ? 'selected' : ''}`}
                onClick={() => { onSelect(p.url); onClose(); }}
              >
                <img src={p.url} alt={p.name} className="preset-img" />
                <span className="preset-name">{p.name}</span>
                {isSelected && <span className="preset-check"><Icon name="check" size={14} /></span>}
              </button>
            );
          })}
        </div>
      )}

      {tab === 'upload' && (
        <div className="upload-dropzone" onClick={() => fileInputRef.current?.click()}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="is-hidden"
            onChange={handleFileChange}
          />
          <div className="upload-icon"><Icon name="camera" size={36} /></div>
          <h4>{uploading ? t('ပုံတင်နေပါသည်...') : t('ဓာတ်ပုံ ဖိုင် ရွေးချယ်ရန် နှိပ်ပါ')}</h4>
          <p className="muted small">{t('JPG, PNG, WebP ပုံများ ထည့်သွင်းနိုင်ပါသည်')}</p>
          <button type="button" className="btn mt-12" disabled={uploading}>
            <Icon name="upload" size={16} /> {t('ပုံဖိုင် ရွေးပါ')}
          </button>
        </div>
      )}

      {tab === 'url' && (
        <div className="stack gap-12">
          <label className="field">
            <span>{t('ပုံ URL ထည့်ပါ')}</span>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/food.jpg"
            />
          </label>
          {urlInput && (
            <div className="url-preview">
              <span className="muted small">{t('နမူနာကြည့်ရှုရန်')}</span>
              <img src={urlInput} alt="Preview" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            </div>
          )}
          <button
            type="button"
            className="btn"
            disabled={!urlInput.trim()}
            onClick={() => { onSelect(urlInput.trim()); onClose(); }}
          >
            <Icon name="check" size={16} /> {t('အတည်ပြုမည်')}
          </button>
        </div>
      )}
    </Modal>
  );
}
