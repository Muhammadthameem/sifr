'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  getAdminSectionsAction,
  reorderCmsSectionsAction,
  toggleCmsSectionActiveAction,
  deleteCmsSectionAction,
  publishCmsSectionAction,
} from '@/lib/actions/cms-actions';
import { CmsSectionEditor } from './CmsSectionEditor';
import {
  Layout,
  Plus,
  ArrowUp,
  ArrowDown,
  Edit,
  Eye,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Globe,
  FileEdit,
} from 'lucide-react';

export function CmsSectionManager() {
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Editor Modal State
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<any | null>(null);

  // Preview Modal State
  const [previewSection, setPreviewSection] = useState<any | null>(null);

  const loadSections = async () => {
    setLoading(true);
    const res = await getAdminSectionsAction();
    if (res.success && res.sections) {
      setSections(res.sections);
    } else {
      setMessage({ type: 'error', text: res.error || 'Failed to load sections' });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSections();
  }, []);

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const res = await toggleCmsSectionActiveAction(id, !currentActive);
    if (res.success) {
      setMessage({
        type: 'success',
        text: `Section ${!currentActive ? 'activated' : 'deactivated'} successfully`,
      });
      loadSections();
    } else {
      setMessage({ type: 'error', text: res.error || 'Failed to update section active state' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handlePublish = async (id: string) => {
    const res = await publishCmsSectionAction(id);
    if (res.success) {
      setMessage({ type: 'success', text: 'Section published to live storefront snapshot!' });
      loadSections();
    } else {
      setMessage({ type: 'error', text: res.error || 'Failed to publish section' });
    }
    setTimeout(() => setMessage(null), 4000);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete section "${title}"?`)) return;

    const res = await deleteCmsSectionAction(id);
    if (res.success) {
      setMessage({ type: 'success', text: 'Section deleted successfully' });
      loadSections();
    } else {
      setMessage({ type: 'error', text: res.error || 'Failed to delete section' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleMove = async (index: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

    const newSections = [...sections];
    const temp = newSections[index];
    newSections[index] = newSections[targetIndex];
    newSections[targetIndex] = temp;

    setSections(newSections);

    const orderedIds = newSections.map((s) => s.id);
    const res = await reorderCmsSectionsAction(orderedIds);
    if (!res.success) {
      setMessage({ type: 'error', text: res.error || 'Failed to reorder sections' });
      loadSections();
    }
  };

  const formatDate = (dateStr: any) => {
    if (!dateStr) return 'Not Published';
    return new Date(dateStr).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900/60 p-6 rounded-xl border border-neutral-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Layout className="w-5 h-5 text-amber-500" />
            Website Content Manager (CMS)
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Manage section-based homepage content, promotional banners, product carousels, and feature cards with deterministic draft/publish snapshot isolation.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingSection(null);
            setEditorOpen(true);
          }}
          className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-neutral-950 font-medium text-xs rounded-lg transition-colors shadow-sm"
          id="btn-create-section"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Section</span>
        </button>
      </div>

      {/* Notifications */}
      {message && (
        <div
          className={`p-4 rounded-lg border text-xs flex items-center space-x-2 ${
            message.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Section List Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-xs text-neutral-500">Loading website sections...</div>
        ) : sections.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500 space-y-2">
            <p className="font-medium text-neutral-400">No CMS sections configured</p>
            <p>Click &quot;Create New Section&quot; above to add your first homepage section.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950/60 border-b border-neutral-800 text-neutral-400 font-mono text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 w-16">Order</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Internal Title</th>
                  <th className="px-4 py-3">Heading / Content</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Published</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 text-neutral-300">
                {sections.map((section, index) => {
                  const hasUnpublishedEdits =
                    section.status === 'PUBLISHED' &&
                    section.publishedAt &&
                    new Date(section.updatedAt).getTime() > new Date(section.publishedAt).getTime();

                  return (
                    <tr key={section.id} className="hover:bg-neutral-800/40 transition-colors">
                      {/* Sort Controls */}
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-1">
                          <button
                            disabled={index === 0}
                            onClick={() => handleMove(index, 'UP')}
                            className="p-1 hover:bg-neutral-800 rounded disabled:opacity-30 text-neutral-400"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            disabled={index === sections.length - 1}
                            onClick={() => handleMove(index, 'DOWN')}
                            className="p-1 hover:bg-neutral-800 rounded disabled:opacity-30 text-neutral-400"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="px-4 py-3 font-mono">
                        <span className="bg-neutral-950 border border-neutral-800 text-amber-400 px-2 py-0.5 rounded text-[10px] font-bold">
                          {section.type}
                        </span>
                      </td>

                      {/* Internal Title */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{section.internalTitle}</div>
                        <div className="text-[10px] text-neutral-500 font-mono">ID: {section.id.slice(0, 8)}...</div>
                      </td>

                      {/* Heading / Content summary */}
                      <td className="px-4 py-3 max-w-xs">
                        {section.heading && <div className="font-serif text-white truncate">{section.heading}</div>}
                        <div className="text-[11px] text-neutral-400 space-x-2">
                          {section.buttons?.length > 0 && <span>{section.buttons.length} Button(s)</span>}
                          {section.productLinks?.length > 0 && <span>{section.productLinks.length} Product(s)</span>}
                          {section.featureCards?.length > 0 && <span>{section.featureCards.length} Card(s)</span>}
                        </div>
                      </td>

                      {/* Status Badges */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono tracking-wider font-semibold border ${
                              section.status === 'PUBLISHED'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                : 'bg-amber-950 text-amber-300 border-amber-800'
                            }`}
                          >
                            {section.status}
                          </span>

                          {hasUnpublishedEdits && (
                            <span className="text-[9px] text-amber-400/90 font-mono font-medium">
                              (Unpublished Draft Edits)
                            </span>
                          )}

                          <span
                            className={`text-[10px] ${section.isActive ? 'text-neutral-400' : 'text-rose-400 font-bold'}`}
                          >
                            {section.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                      </td>

                      {/* Published At */}
                      <td className="px-4 py-3 text-neutral-400 font-mono text-[11px]">
                        {formatDate(section.publishedAt)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => {
                              setEditingSection(section);
                              setEditorOpen(true);
                            }}
                            className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded border border-neutral-700"
                            title="Edit Section Draft"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setPreviewSection(section)}
                            className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-400 rounded border border-neutral-700"
                            title="Preview Draft Payload"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handlePublish(section.id)}
                            className="px-2 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 text-[11px] font-medium rounded"
                            title="Publish Section to Live Storefront"
                          >
                            Publish
                          </button>

                          <button
                            onClick={() => handleToggleActive(section.id, section.isActive)}
                            className="px-2 py-1 text-[11px] border border-neutral-700 hover:bg-neutral-800 text-neutral-300 rounded"
                          >
                            {section.isActive ? 'Disable' : 'Enable'}
                          </button>

                          <button
                            onClick={() => handleDelete(section.id, section.internalTitle)}
                            className="p-1.5 text-neutral-500 hover:text-rose-400 rounded hover:bg-neutral-800"
                            title="Delete Section"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CmsSectionEditor Modal */}
      {editorOpen && (
        <CmsSectionEditor
          initialData={editingSection}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            setEditorOpen(false);
            loadSections();
          }}
        />
      )}

      {/* Preview Modal */}
      {previewSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-amber-400" />
                  Section Preview: {previewSection.internalTitle}
                </h3>
                <span className="text-[10px] font-mono text-neutral-400">
                  Type: {previewSection.type} | Status: {previewSection.status}
                </span>
              </div>
              <button onClick={() => setPreviewSection(null)} className="text-neutral-400 hover:text-white">
                ✕
              </button>
            </div>

            {/* Preview Viewport */}
            <div className="p-6 bg-white text-neutral-900 rounded-lg space-y-4">
              {previewSection.heading && (
                <h2 className="font-serif text-2xl font-bold text-neutral-900 tracking-tight">
                  {previewSection.heading}
                </h2>
              )}
              {previewSection.subheading && <p className="text-sm text-neutral-600">{previewSection.subheading}</p>}
              {previewSection.imageUrl && (
                <Image
                  src={previewSection.imageUrl}
                  alt={previewSection.altText || 'Section Image'}
                  width={600}
                  height={240}
                  unoptimized
                  className="w-full max-h-60 object-cover rounded"
                />
              )}
              {previewSection.buttons?.length > 0 && (
                <div className="flex gap-3 pt-2">
                  {previewSection.buttons.map((b: any, idx: number) => (
                    <span
                      key={idx}
                      className={`px-4 py-2 text-xs font-semibold rounded ${
                        b.style === 'PRIMARY' ? 'bg-neutral-900 text-white' : 'border border-neutral-900 text-neutral-900'
                      }`}
                    >
                      {b.label} ({b.url})
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setPreviewSection(null)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-medium rounded-lg"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
