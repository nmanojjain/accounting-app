'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import styles from './LedgerSelector.module.css';

export default function LedgerSelector({
    ledgers = [],
    value,
    onSelect,
    placeholder = "Select Ledger",
    label,
    autoFocus = false,
    className
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [recentLedgers, setRecentLedgers] = useState([]);
    const searchInputRef = useRef(null);
    const triggerRef = useRef(null);

    // Load recents from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem('recentLedgers');
            if (saved) {
                setRecentLedgers(JSON.parse(saved));
            }
        } catch (e) {
            console.error("Failed to load recents", e);
        }
    }, []);

    const [selectedIndex, setSelectedIndex] = useState(0);

    // Reset selected index when search changes or modal opens
    useEffect(() => {
        setSelectedIndex(0);
    }, [searchTerm, isOpen]);

    // Focus search input when modal opens
    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            // Small timeout to ensure DOM is ready
            setTimeout(() => {
                searchInputRef.current.focus();
            }, 50);
        }
    }, [isOpen]);

    // Auto-open if autoFocus is true
    useEffect(() => {
        if (autoFocus) {
            setIsOpen(true);
        }
    }, [autoFocus]);

    const handleSelect = (ledger) => {
        onSelect(ledger);
        setIsOpen(false);
        setSearchTerm('');

        // Update recents
        const newRecents = [
            ledger.id,
            ...recentLedgers.filter(id => id !== ledger.id)
        ].slice(0, 5);

        setRecentLedgers(newRecents);
        localStorage.setItem('recentLedgers', JSON.stringify(newRecents));
    };

    const filteredLedgers = useMemo(() => {
        if (!searchTerm) return ledgers;

        const lowerTerm = searchTerm.toLowerCase();

        // 1. Strict substring match (High priority)
        const exactMatches = ledgers.filter(l =>
            l.name.toLowerCase().includes(lowerTerm) ||
            (l.group_name && l.group_name.toLowerCase().includes(lowerTerm))
        );

        if (exactMatches.length > 0) return exactMatches;

        // 2. Fuzzy subsequence match (Fallback)
        // e.g. "sbc" matches "State Bank of Canada"
        const isSubsequence = (term, text) => {
            let termIdx = 0;
            for (let char of text) {
                if (char === term[termIdx]) {
                    termIdx++;
                }
                if (termIdx === term.length) return true;
            }
            return false;
        };

        return ledgers.filter(l =>
            isSubsequence(lowerTerm, l.name.toLowerCase()) ||
            (l.group_name && isSubsequence(lowerTerm, l.group_name.toLowerCase()))
        );
    }, [ledgers, searchTerm]);

    // Split into Recents and Others for empty search state
    const { recentList, otherList, flattenedList } = useMemo(() => {
        if (searchTerm) {
            // When searching, we just have one list
            return { recentList: [], otherList: filteredLedgers, flattenedList: filteredLedgers };
        }

        const recent = [];
        const others = [];

        ledgers.forEach(l => {
            if (recentLedgers.includes(l.id)) {
                recent.push(l);
            } else {
                others.push(l);
            }
        });

        // Sort recent by index in stored array to maintain order
        recent.sort((a, b) => recentLedgers.indexOf(a.id) - recentLedgers.indexOf(b.id));

        return {
            recentList: recent,
            otherList: others,
            flattenedList: [...recent, ...others] // For keyboard nav
        };
    }, [filteredLedgers, searchTerm, recentLedgers, ledgers]);

    const handleKeyDown = (e) => {
        if (!isOpen) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev =>
                prev < flattenedList.length - 1 ? prev + 1 : prev
            );
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (flattenedList[selectedIndex]) {
                handleSelect(flattenedList[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    return (
        <div className={`${styles.container} ${className || ''}`}>
            {label && <label className={styles.label}>{label}</label>}

            {/* Trigger Input */}
            <div
                className={styles.trigger}
                onClick={() => setIsOpen(true)}
                ref={triggerRef}
            >
                <input
                    type="text"
                    value={value || ''}
                    readOnly
                    placeholder={placeholder}
                    className={styles.triggerInput}
                />
                <span className={styles.chevron}>▼</span>
            </div>

            {/* Modal */}
            {isOpen && createPortal(
                <div className={styles.modalOverlay} onClick={() => setIsOpen(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>

                        {/* Search Header */}
                        <div className={styles.searchHeader}>
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Search ledgers..."
                                className={styles.searchInput}
                            />
                            <button
                                onClick={() => setIsOpen(false)}
                                className={styles.closeBtn}
                            >
                                Close
                            </button>
                        </div>

                        {/* List */}
                        <div className={styles.listContainer}>
                            {(!searchTerm && recentList.length > 0) && (
                                <div className={styles.section}>
                                    <h4 className={styles.sectionTitle}>Recent</h4>
                                    {recentList.map((ledger, idx) => {
                                        const isSelected = idx === selectedIndex;
                                        return (
                                            <div
                                                key={ledger.id}
                                                className={`${styles.listItem} ${isSelected ? styles.selected : ''}`}
                                                onClick={() => handleSelect(ledger)}
                                            >
                                                <div className={styles.itemName}>{ledger.name}</div>
                                                <div className={styles.itemGroup}>{ledger.group_name}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <div className={styles.section}>
                                {(!searchTerm && recentList.length > 0) && <h4 className={styles.sectionTitle}>All Ledgers</h4>}
                                {otherList.length === 0 ? (
                                    <div className={styles.noResults}>No ledgers found</div>
                                ) : (
                                    otherList.map((ledger, idx) => {
                                        // Calculate index in the flattened list
                                        const globalIndex = (!searchTerm && recentList.length > 0)
                                            ? recentList.length + idx
                                            : idx;

                                        const isSelected = globalIndex === selectedIndex;

                                        return (
                                            <div
                                                key={ledger.id}
                                                className={`${styles.listItem} ${isSelected ? styles.selected : ''}`}
                                                onClick={() => handleSelect(ledger)}
                                            >
                                                <div className={styles.itemName}>{ledger.name}</div>
                                                <div className={styles.itemGroup}>{ledger.group_name}</div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
