'use client';

import React, { useState } from 'react';
import { X, Ruler } from 'lucide-react';

interface SizeGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryName?: string;
}

export function SizeGuideModal({ isOpen, onClose, categoryName }: SizeGuideModalProps) {
  const [unit, setUnit] = useState<'in' | 'cm'>('in');

  if (!isOpen) return null;

  const sizeChartData = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Size Guide"
    >
      <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
          <div className="flex items-center space-x-2">
            <Ruler className="w-5 h-5 text-neutral-900" />
            <h3 className="font-serif text-xl font-normal text-neutral-900 tracking-tight">
              Size Guide — {categoryName || 'Apparel'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-900 rounded-full hover:bg-neutral-100 transition-colors"
            aria-label="Close Size Guide"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto text-xs font-sans">
          {/* Unit Toggle */}
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-widest">
              Garment Measurements
            </span>
            <div className="inline-flex rounded border border-neutral-200 p-0.5 bg-neutral-100 font-mono text-xs">
              <button
                onClick={() => setUnit('in')}
                className={`px-3 py-1 rounded transition-colors ${
                  unit === 'in' ? 'bg-neutral-900 text-white font-bold' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Inches (&quot;)
              </button>
              <button
                onClick={() => setUnit('cm')}
                className={`px-3 py-1 rounded transition-colors ${
                  unit === 'cm' ? 'bg-neutral-900 text-white font-bold' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Metric (cm)
              </button>
            </div>
          </div>

          {/* Measurement Table */}
          <div className="overflow-x-auto border border-neutral-200 rounded-lg">
            <table className="w-full text-left font-mono">
              <thead className="bg-neutral-900 text-white text-[10px] uppercase tracking-widest">
                <tr>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Chest / Bust</th>
                  <th className="px-4 py-3">Waist</th>
                  <th className="px-4 py-3">Hip</th>
                  <th className="px-4 py-3">Body Length</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 text-neutral-800 text-xs">
                {sizeChartData.map((size) => (
                  <tr key={size} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-2.5 font-bold text-neutral-900">{size}</td>
                    <td className="px-4 py-2.5 text-neutral-400">—</td>
                    <td className="px-4 py-2.5 text-neutral-400">—</td>
                    <td className="px-4 py-2.5 text-neutral-400">—</td>
                    <td className="px-4 py-2.5 text-neutral-400">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Measuring Tips */}
          <div className="bg-neutral-50 border border-neutral-200/80 p-4 rounded-lg space-y-2">
            <h4 className="font-mono text-[11px] font-bold text-neutral-900 uppercase tracking-wider">
              How to Measure
            </h4>
            <ul className="space-y-1 text-neutral-600 text-[11px] list-disc list-inside font-light leading-relaxed">
              <li><strong>Chest/Bust:</strong> Measure under arms around the fullest part of the chest.</li>
              <li><strong>Waist:</strong> Measure around the natural waistline, keeping tape comfortably loose.</li>
              <li><strong>Hip:</strong> Stand with feet together and measure around the fullest part of hips.</li>
              <li><strong>Length:</strong> Measure from the highest point of shoulder to top of hip/hem.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-neutral-200 bg-neutral-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-neutral-900 text-white text-xs font-mono tracking-widest uppercase rounded hover:bg-neutral-800 transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}
