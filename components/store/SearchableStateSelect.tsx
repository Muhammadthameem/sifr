'use client';

import React, { useState, useRef, useEffect } from 'react';
import { INDIAN_STATES_AND_UTS, IndianStateOrUT } from '@/lib/constants/states';
import { ChevronDown, Search, Check, X } from 'lucide-react';

interface SearchableStateSelectProps {
  value: string;
  onChange: (state: string) => void;
  error?: string;
  id?: string;
  disabled?: boolean;
}

export function SearchableStateSelect({
  value,
  onChange,
  error,
  id = 'customer-state',
  disabled = false,
}: SearchableStateSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const filteredStates = INDIAN_STATES_AND_UTS.filter((state) =>
    state.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const handleSelect = (state: string) => {
    onChange(state);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full bg-white border rounded px-3 py-2 text-left flex items-center justify-between text-xs font-mono transition-colors ${
          error
            ? 'border-rose-400 focus:border-rose-600 ring-1 ring-rose-100'
            : 'border-neutral-300 hover:border-neutral-400 focus:border-neutral-900'
        } ${disabled ? 'opacity-60 cursor-not-allowed bg-neutral-100' : 'cursor-pointer'}`}
      >
        <span className={value ? 'text-neutral-900 font-medium' : 'text-neutral-400'}>
          {value || 'Select Indian State / UT'}
        </span>
        <div className="flex items-center space-x-1 text-neutral-400">
          {value && !disabled && (
            <span
              onClick={handleClear}
              className="p-0.5 hover:text-neutral-700 transition-colors"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-neutral-900' : ''}`}
          />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
          {/* Search Input Bar */}
          <div className="p-2 border-b border-neutral-100 bg-neutral-50 flex items-center space-x-2">
            <Search className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Indian State / UT..."
              className="w-full bg-transparent border-none text-xs font-mono text-neutral-900 placeholder-neutral-400 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsOpen(false);
                  setSearchQuery('');
                } else if (e.key === 'Enter' && filteredStates.length > 0) {
                  e.preventDefault();
                  handleSelect(filteredStates[0]);
                }
              }}
            />
          </div>

          {/* List of States */}
          <ul
            role="listbox"
            className="max-h-60 overflow-y-auto py-1 divide-y divide-neutral-50 text-xs font-mono"
          >
            {filteredStates.length === 0 ? (
              <li className="px-3 py-4 text-center text-neutral-400 italic text-[11px]">
                No matching Indian State or UT found
              </li>
            ) : (
              filteredStates.map((state) => {
                const isSelected = value === state;
                return (
                  <li
                    key={state}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(state)}
                    className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-neutral-900 text-white font-medium'
                        : 'text-neutral-800 hover:bg-neutral-100'
                    }`}
                  >
                    <span>{state}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}

      {error && <p className="text-[11px] font-mono text-rose-600 mt-1">{error}</p>}
    </div>
  );
}
