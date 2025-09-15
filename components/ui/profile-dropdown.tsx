"use client"

import * as React from "react"
import { useState, useRef, useEffect, useId } from "react"
import { User, Settings, LogOut, Star } from "lucide-react"
import { cn } from "@/lib/utils"

// Simple dropdown without Radix UI to avoid build issues
interface ProfileDropdownProps {
  user?: {
    name?: string
    email?: string
    phone?: string
    avatar?: string
    initials?: string
  }
  onProfileClick?: () => void
  onAdminClick?: () => void
  onLogout?: () => void
  isAdmin?: boolean
}

const ProfileDropdown: React.FC<ProfileDropdownProps> = ({
  user,
  onProfileClick = () => {},
  onAdminClick = () => {},
  onLogout = () => {},
  isAdmin = false
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const uid = useId()
  const buttonId = `profile-menu-button-${uid}`
  const menuId = `profile-menu-${uid}`

  const displayName = user?.name || user?.email || user?.phone || "User"
  const displayEmail = user?.email || ""

  // Keyboard support for role="menu"
  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const menu = dropdownRef.current?.querySelector(`#${menuId}`) as HTMLElement | null;
    const items = menu?.querySelectorAll('[role="menuitem"]') as NodeListOf<HTMLButtonElement> | undefined;
    if (!items || items.length === 0) return;

    const currentIndex = Array.from(items).indexOf(document.activeElement as HTMLButtonElement);

    const focusAt = (idx: number) => {
      e.preventDefault();
      items[idx]?.focus();
    };

    switch (e.key) {
      case 'ArrowDown': focusAt((currentIndex + 1 + items.length) % items.length); break;
      case 'ArrowUp':   focusAt((currentIndex - 1 + items.length) % items.length); break;
      case 'Home':      focusAt(0); break;
      case 'End':       focusAt(items.length - 1); break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        (document.getElementById(buttonId) as HTMLButtonElement | null)?.focus();
        break;
      case 'Tab':
        // Close on Tab so users can continue their tab order
        setIsOpen(false);
        break;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('pointerdown', handleClickOutside)
      // Focus first actionable item
      setTimeout(() => {
        const firstButton = dropdownRef.current?.querySelector(`#${menuId} button`) as HTMLButtonElement;
        firstButton?.focus();
      }, 0)
    }

    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
    }
  }, [isOpen, menuId])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        id={buttonId}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F141E] text-primary hover:bg-[#161b26] transition-colors"
        title="Profile & Settings"
        aria-label="Open profile menu"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
      >
        <User className="h-4 w-4" />
      </button>

      {isOpen && (
        <div
          id={menuId}
          aria-labelledby={buttonId}
          role="menu"
          aria-orientation="vertical"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-10 w-56 bg-[#0F141E] border border-[#1E1E32]/20 rounded-md shadow-lg z-50"
        >
          {displayName && (
            <>
              <div className="px-3 py-2 border-b border-[#1E1E32]/20">
                <p className="text-sm font-medium leading-none text-white">{displayName}</p>
                {displayEmail && (
                  <p className="text-xs leading-none text-muted-foreground mt-1">
                    {displayEmail}
                  </p>
                )}
              </div>
            </>
          )}
          
          <div className="py-1">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                onProfileClick()
                setIsOpen(false)
              }}
              className="w-full px-3 py-2 text-sm text-left hover:bg-[#161b26] transition-colors flex items-center"
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </button>
            
            {isAdmin && (
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  onAdminClick()
                  setIsOpen(false)
                }}
                className="w-full px-3 py-2 text-sm text-left hover:bg-[#161b26] transition-colors flex items-center"
              >
                <Star className="mr-2 h-4 w-4" />
                Admin
              </button>
            )}
          </div>
          
          <div className="border-t border-[#1E1E32]/20 py-1">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                onLogout()
                setIsOpen(false)
              }}
              className="w-full px-3 py-2 text-sm text-left text-red-400 hover:bg-red-500/10 hover:text-red-400 transition-colors flex items-center"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProfileDropdown