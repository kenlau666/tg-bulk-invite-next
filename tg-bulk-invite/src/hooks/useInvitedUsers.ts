import { useState, useEffect } from 'react';
import Cookies from 'js-cookie';

export interface InvitedUser {
  id: number;
  firstName: string | null;
  groupId: string;
  timestamp: number;
}

const COOKIE_NAME = 'invitedUsers';
const COOKIE_MAX_AGE = 30; // days

export function useInvitedUsers(targetGroup: string | null) {
  const [invitedUsers, setInvitedUsers] = useState<InvitedUser[]>([]);

  // Load invited users from cookie when component mounts
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = Cookies.get(COOKIE_NAME);
      if (stored) {
        try {
          setInvitedUsers(JSON.parse(stored));
        } catch (e) {
          console.error('Error parsing cookie data:', e);
          setInvitedUsers([]);
        }
      }
    }
  }, []);

  // Save to cookie whenever invitedUsers changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        // Cookies have size limits, so we'll keep only the last 1000 entries
        const limitedUsers = invitedUsers.slice(-1000);
        Cookies.set(COOKIE_NAME, JSON.stringify(limitedUsers), {
          expires: COOKIE_MAX_AGE,
          sameSite: 'strict',
          secure: process.env.NODE_ENV === 'production'
        });
      } catch (e) {
        console.error('Error saving to cookie:', e);
      }
    }
  }, [invitedUsers]);

  const addInvitedUser = (user: { id: number; firstName: string | null }, groupId: string) => {
    setInvitedUsers(prev => {
      // Check if user is already invited to this group
      const exists = prev.some(u => u.id === user.id && u.groupId === groupId);
      if (exists) return prev;

      // Add new user and remove oldest entries if we exceed 1000
      const newUsers = [...prev, {
        id: user.id,
        firstName: user.firstName,
        groupId,
        timestamp: Date.now()
      }];

      // Keep only the last 1000 entries
      return newUsers.slice(-1000);
    });
  };

  const isUserInvited = (userId: number, groupId: string) => {
    return invitedUsers.some(u => u.id === userId && u.groupId === groupId);
  };

  const getInvitedUsersForGroup = (groupId: string) => {
    return invitedUsers.filter(u => u.groupId === groupId);
  };

  const clearInvitedUsers = () => {
    setInvitedUsers([]);
    Cookies.remove(COOKIE_NAME);
  };

  return {
    invitedUsers,
    addInvitedUser,
    isUserInvited,
    getInvitedUsersForGroup,
    clearInvitedUsers
  };
} 