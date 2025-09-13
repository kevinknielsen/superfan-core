"use client"

import * as React from "react"
import { useState, useRef, useEffect } from "react"
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

  const displayName = user?.name || user?.email || user?.phone || "User"
  const displayEmail = user?.email || ""

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }

    if (isOpen) {
      document.addEventListener('pointerdown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F141E] text-primary hover:bg-[#161b26] transition-colors"
        title="Profile & Settings"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="profile-menu"
      >
        <User className="h-4 w-4" />
      </button>

      {isOpen && (
        <div
          id="profile-menu"
          role="menu"
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
              role="menuitem"
              onClick={() => {
                onProfileClick()
                setIsOpen(false)
              }}
              className="w-full px-3 py-2 text-sm text-left hover:bg-[#161b26] transition-colors flex items-center"
            >
              <User className="mr-2 h-4 w-4" />
              Settings
            </button>
            
            {isAdmin && (
              <button
                role="menuitem"
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
              role="menuitem"
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