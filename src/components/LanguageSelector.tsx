"use client";

import React, { useState, useEffect } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { locales, localeLabels, Locale } from '@/i18n/config';

export default function LanguageSelector() {
  const { locale, setLocale, t } = useI18n();
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    // Check if user has already selected a language
    const hasSelectedLanguage = localStorage.getItem('has-selected-language');
    if (!hasSelectedLanguage) {
      // Show after a short delay for better UX
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      // Show minimized version
      setIsMinimized(true);
    }
  }, []);

  const handleSelect = (newLocale: Locale) => {
    if (newLocale === locale) {
      handleClose();
      return;
    }

    setLocale(newLocale);
    handleClose();
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
      setIsMinimized(true);
      localStorage.setItem('has-selected-language', 'true');
    }, 200);
  };

  const handleOpen = () => {
    setIsMinimized(false);
    setIsVisible(true);
  };

  // Minimized floating button
  if (isMinimized && !isVisible) {
    return (
      <button
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-[#0F172A]/90 backdrop-blur-xl border border-white/[0.08] shadow-lg hover:scale-110 transition-all duration-200 flex items-center justify-center"
        title={String(t('language.title'))}
      >
        <span className="text-lg">{localeLabels[locale].flag}</span>
      </button>
    );
  }

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed bottom-6 right-6 z-50 transition-all duration-200 ${
        isClosing ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
      }`}
    >
      <div className="bg-[#0F172A]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] w-[280px] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/[0.06] flex justify-between items-center">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[#22C55E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
            <h3 className="text-sm font-semibold text-[#F8FAFC]">{String(t('language.title'))}</h3>
          </div>
          <button 
            onClick={handleClose}
            className="w-6 h-6 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Description */}
        <div className="px-4 py-2 bg-white/[0.02]">
          <p className="text-xs text-slate-400">{String(t('language.description'))}</p>
        </div>

        {/* Language Options */}
        <div className="p-2 space-y-1">
          {locales.map((loc) => {
            const isActive = loc === locale;
            return (
              <button
                key={loc}
                onClick={() => handleSelect(loc)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-[#22C55E] text-white shadow-lg shadow-green-500/20'
                    : 'bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-white border border-white/[0.04]'
                }`}
              >
                <span className="text-lg">{localeLabels[loc].flag}</span>
                <div className="flex-1 text-left">
                  <span className="text-sm font-medium">{localeLabels[loc].name}</span>
                </div>
                {isActive && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-2 bg-white/[0.02] border-t border-white/[0.06]">
          <p className="text-[10px] text-slate-500 text-center">
            Default: English
          </p>
        </div>
      </div>
    </div>
  );
}
