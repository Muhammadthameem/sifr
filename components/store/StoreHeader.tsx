'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { BRAND_CONFIG, STORE_NAV_ITEMS } from '@/lib/constants/brand';
import { Search, ShoppingBag, Menu, X, ChevronDown } from 'lucide-react';
import { CartDrawer } from '@/components/store/CartDrawer';
import { SearchOverlay } from '@/components/store/SearchOverlay';
import { fetchCartAction } from '@/lib/actions/cart-actions';
import { ActiveCategoryNode } from '@/lib/actions/category-actions';

interface StoreHeaderProps {
  categoryTree?: ActiveCategoryNode[];
}

export function StoreHeader({ categoryTree = [] }: StoreHeaderProps) {
  const [categories, setCategories] = useState<ActiveCategoryNode[]>(categoryTree);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileCollectionsOpen, setMobileCollectionsOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [itemCount, setItemCount] = useState(0);

  useEffect(() => {
    setCategories(categoryTree);
  }, [categoryTree]);

  useEffect(() => {
    if (categories.length === 0) {
      import('@/lib/actions/category-actions').then(({ getActiveCategoryTree }) => {
        getActiveCategoryTree().then((tree) => {
          if (tree && tree.length > 0) setCategories(tree);
        });
      });
    }
  }, [categories.length]);

  const collectionsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const collectionsDropdownRef = useRef<HTMLDivElement>(null);

  const handleCollectionsEnter = () => {
    if (collectionsTimeoutRef.current) {
      clearTimeout(collectionsTimeoutRef.current);
      collectionsTimeoutRef.current = null;
    }
    setCollectionsOpen(true);
  };

  const handleCollectionsLeave = () => {
    collectionsTimeoutRef.current = setTimeout(() => {
      setCollectionsOpen(false);
    }, 200);
  };

  const handleCollectionsToggle = () => {
    if (collectionsTimeoutRef.current) {
      clearTimeout(collectionsTimeoutRef.current);
      collectionsTimeoutRef.current = null;
    }
    setCollectionsOpen((prev) => !prev);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        collectionsDropdownRef.current &&
        !collectionsDropdownRef.current.contains(event.target as Node)
      ) {
        setCollectionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const refreshCartCount = async () => {
    try {
      const data = await fetchCartAction();
      if (data) setItemCount(data.itemCount);
    } catch {
      // ignore header cart count errors
    }
  };

  useEffect(() => {
    refreshCartCount();
  }, []);

  // Keyboard shortcut listener: '/' to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if target is input, textarea, or contentEditable
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md text-neutral-900 border-b border-neutral-200 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top Header Bar */}
          <div className="h-16 sm:h-20 flex items-center justify-between">
            {/* Mobile Navigation Toggle (Left) */}
            <div className="flex md:hidden items-center">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-neutral-700 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 rounded transition-colors"
                aria-label="Toggle Menu"
                id="mobile-hamburger-btn"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>

            {/* Desktop Left Navigation: SHOP | MEN | WOMEN | COLLECTIONS */}
            <nav className="hidden md:flex items-center space-x-8 text-xs tracking-[0.2em] font-medium uppercase font-sans">
              {STORE_NAV_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="text-neutral-700 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 rounded transition-colors"
                >
                  {item.label}
                </Link>
              ))}

              {/* Collections Dropdown Menu */}
              <div
                ref={collectionsDropdownRef}
                className="relative py-2 group"
                onMouseEnter={handleCollectionsEnter}
                onMouseLeave={handleCollectionsLeave}
              >
                <button
                  type="button"
                  onClick={handleCollectionsToggle}
                  aria-expanded={collectionsOpen}
                  className="inline-flex items-center space-x-1 text-neutral-700 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 rounded transition-colors cursor-pointer"
                >
                  <span>COLLECTIONS</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      collectionsOpen ? 'rotate-180' : 'group-hover:rotate-180'
                    }`}
                  />
                </button>

                <div
                  className={`absolute top-full left-0 mt-2 w-56 bg-white border border-neutral-200/90 shadow-xl rounded-lg py-2 z-50 transition-all duration-150 ${
                    collectionsOpen
                      ? 'opacity-100 visible translate-y-0 pointer-events-auto'
                      : 'opacity-0 invisible -translate-y-1 pointer-events-none group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto group-hover:translate-y-0'
                  }`}
                >
                  <div className="py-1">
                    {categories.map((parent) => (
                      <Link
                        key={parent.id}
                        href={`/categories/${parent.slug}`}
                        onClick={() => setCollectionsOpen(false)}
                        className="block px-4 py-2 text-xs font-mono tracking-wider uppercase text-neutral-700 hover:text-neutral-950 hover:bg-neutral-50 transition-colors"
                      >
                        {parent.name}
                      </Link>
                    ))}
                  </div>

                  <div className="my-1.5 border-t border-neutral-100" />

                  <div className="py-1">
                    <Link
                      href="/shop"
                      onClick={() => setCollectionsOpen(false)}
                      className="block px-4 py-2 text-xs font-mono font-medium tracking-wider uppercase text-neutral-900 hover:bg-neutral-50 transition-colors"
                    >
                      ALL PRODUCTS
                    </Link>
                  </div>
                </div>
              </div>
            </nav>

            {/* Fixed Brand Identity (Center) — Non-CMS Editable */}
            <div className="flex-1 text-center md:flex-initial">
              <Link
                href="/"
                className="font-serif text-2xl sm:text-3xl tracking-[0.3em] font-semibold text-neutral-900 uppercase hover:opacity-80 transition-opacity"
              >
                {BRAND_CONFIG.name}
              </Link>
            </div>

            {/* Desktop & Mobile Right Navigation: SEARCH | CART */}
            <div className="flex items-center space-x-6">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="flex items-center space-x-2 text-xs tracking-[0.2em] uppercase text-neutral-700 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 rounded transition-colors"
                aria-label="Search"
                id="store-search-btn"
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">SEARCH</span>
              </button>

              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="flex items-center space-x-2 text-xs tracking-[0.2em] uppercase text-neutral-700 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 rounded transition-colors relative"
                aria-label="Cart"
                id="store-cart-btn"
              >
                <ShoppingBag className="w-4 h-4" />
                <span className="hidden sm:inline">CART</span>
                <span className="ml-1 text-[10px] bg-neutral-100 text-neutral-900 border border-neutral-300 px-1.5 py-0.5 rounded-full font-mono">
                  {itemCount}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-neutral-200 px-6 py-6 space-y-4 animate-in slide-in-from-top duration-200">
            <div className="flex flex-col space-y-2">
              {STORE_NAV_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-sm font-medium tracking-[0.2em] uppercase text-neutral-800 hover:text-neutral-900 py-2.5 border-b border-neutral-100"
                >
                  {item.label}
                </Link>
              ))}

              {/* Mobile Collections Collapsible Accordion */}
              <div className="border-b border-neutral-100 py-1">
                <button
                  type="button"
                  onClick={() => setMobileCollectionsOpen(!mobileCollectionsOpen)}
                  className="w-full flex items-center justify-between text-sm font-medium tracking-[0.2em] uppercase text-neutral-800 hover:text-neutral-900 py-2.5"
                >
                  <span>COLLECTIONS</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${
                      mobileCollectionsOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {mobileCollectionsOpen && (
                  <div className="pl-3 py-2 space-y-2 bg-neutral-50/70 rounded-md mb-2">
                    {categories.map((parent) => (
                      <Link
                        key={parent.id}
                        href={`/categories/${parent.slug}`}
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setMobileCollectionsOpen(false);
                        }}
                        className="block text-xs font-mono tracking-wider uppercase text-neutral-700 hover:text-neutral-950 py-1.5"
                      >
                        {parent.name}
                      </Link>
                    ))}
                    <div className="pt-2 border-t border-neutral-200/60">
                      <Link
                        href="/shop"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setMobileCollectionsOpen(false);
                        }}
                        className="block text-xs font-mono font-medium tracking-wider uppercase text-neutral-950 py-1"
                      >
                        ALL PRODUCTS
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Header Search Overlay */}
      <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        onCartChange={refreshCartCount}
      />
    </>
  );
}
