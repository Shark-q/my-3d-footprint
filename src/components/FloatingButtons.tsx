"use client";

import React, { useState, useEffect } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { locales, localeLabels, Locale } from '@/i18n/config';

interface FloatingButtonsProps {
  onLocate: () => void;
  isLocating: boolean;
}

export default function FloatingButtons({ onLocate, isLocating }: FloatingButtonsProps) {
  const { t, locale, setLocale } = useI18n();
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [hasSelectedLang, setHasSelectedLang] = useState(false);

  useEffect(() => {
    const hasSelected = localStorage.getItem('has-selected-language');
    setHasSelectedLang(!!hasSelected);
  }, []);

  const handleSelectLang = (newLocale: Locale) => {
    if (newLocale !== locale) {
      setLocale(newLocale);
    }
    setIsLangOpen(false);
    setHasSelectedLang(true);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-end gap-3">
      {/* Language Selector Popover */}
      {isLangOpen && (
        <div className="mb-14 absolute bottom-0 right-14">
          <div className="bg-[#0F172A]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] w-[200px] overflow-hidden animate-in fade-in slide-in-from-right-2 duration-200">
            {/* Header */}
            <div className="px-3 py-2 border-b border-white/[0.06] flex justify-between items-center">
              <span className="text-xs font-medium text-slate-300">{String(t('language.title'))}</span>
              <button 
                onClick={() => setIsLangOpen(false)}
                className="w-5 h-5 rounded bg-white/[0.05] hover:bg-white/[0.08] text-slate-400 hover:text-white flex items-center justify-center transition-all"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Language Options */}
            <div className="p-1.5 space-y-1">
              {locales.map((loc) => {
                const isActive = loc === locale;
                return (
                  <button
                    key={loc}
                    onClick={() => handleSelectLang(loc)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all duration-200 ${
                      isActive
                        ? 'bg-[#22C55E] text-white'
                        : 'bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <span className="text-base">{localeLabels[loc].flag}</span>
                    <span className="text-xs font-medium">{localeLabels[loc].name}</span>
                    {isActive && (
                      <svg className="w-3.5 h-3.5 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Language Toggle Button */}
      <button
        onClick={() => setIsLangOpen(!isLangOpen)}
        className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg transition-all duration-200 shadow-lg ${
          isLangOpen
            ? 'bg-[#22C55E] text-white scale-110'
            : 'bg-[#0F172A]/90 backdrop-blur-xl border border-white/[0.08] hover:scale-110'
        }`}
        title={String(t('language.title'))}
      >
        {localeLabels[locale].flag}
      </button>

      {/* Geolocation Button */}
      <button
        onClick={onLocate}
        disabled={isLocating}
        className="w-12 h-12 rounded-xl bg-[#0F172A]/90 backdrop-blur-xl border border-white/[0.08] flex items-center justify-center text-white hover:bg-white/10 hover:scale-110 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        title={String(t('map.myLocation'))}
      >
        {isLocating ? (
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
      </button>
    </div>
  );
}
