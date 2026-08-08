import React, { useState, useEffect, useRef } from 'react';
import { callImoAI } from './utils/aiConfig';
import { ArrowLeft, MoreVertical, Send, Image as ImageIcon, Smile, Trash2, Check, CheckCheck, Loader2, Star, X, ImageOff, Ban, Edit2, Heart, Reply, Download, Clock } from 'lucide-react';

import Pusher from 'pusher-js';
import EmojiPicker, { Categories } from 'emoji-picker-react';
import { notify } from './utils/toast';
import { Filesystem, Directory } from '@capacitor/filesystem';
import localforage from 'localforage';
import pusher from './pusher';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const cachedMessages = {};

const formatDateDivider = (dateString) => {
  const d = new Date(dateString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) {
    return 'Hari ini';
  } else if (d.toDateString() === yesterday.toDateString()) {
    return 'Kemarin';
  } else {
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }
};

const MediaMessage = ({ msg, base64Part, captionPart, isMe, selectionMode, setPreviewModalImage, setLongPressMessage }) => {
    const getInitialImgSrc = () => {
        if (base64Part.startsWith('data:image/')) return base64Part;
        if (base64Part.startsWith('R2_IMAGE|||')) return base64Part.split('|||')[2];
        if (base64Part.startsWith('IMGBB_IMAGE|||')) return base64Part.split('|||')[1];
        return null;
    };
    
    const [imgSrc, setImgSrc] = useState(getInitialImgSrc);
    const [isFailed, setIsFailed] = useState(false);
    const msgId = msg.id;
    
    const holdTimeout = useRef(null);
    const [isHolding, setIsHolding] = useState(false);

    const handleTouchStart = () => {
      if (selectionMode) return;
      setIsHolding(false);
      holdTimeout.current = setTimeout(() => {
        setIsHolding(true);
        setLongPressMessage(msg);
      }, 500);
    };

    const handleTouchEnd = () => {
      if (holdTimeout.current) clearTimeout(holdTimeout.current);
    };
    
    useEffect(() => {
      let isMounted = true;
      const loadMedia = async () => {
        try {
          if (base64Part.startsWith('data:image/')) {
            // Old system / backward compatibility
            setImgSrc(base64Part);
            return;
          }
          
          if (base64Part === 'MEDIA_DELETED') {
            setIsFailed(true);
            return;
          }

            if (base64Part.startsWith('IMGBB_IMAGE|||')) {
              const url = base64Part.split('|||')[1];
              
              const localStored = await localforage.getItem(`r2_media_${msgId}`);
              if (localStored) {
                if (isMounted) setImgSrc(localStored);
                return;
              }
              
              if (isMounted) setImgSrc(url);
              return;
            }

          if (base64Part.startsWith('R2_IMAGE|||')) {
            const parts = base64Part.split('|||');
            const key = parts[1];
            let imageUrl = parts[2];
            
            // Cek apakah sudah di-download ke localforage sebelumnya (termasuk untuk pengirim)
            const localStored = await localforage.getItem(`r2_media_${msgId}`);
            if (localStored) {
              if (isMounted) setImgSrc(localStored);
              return;
            }

            // Jika belum di-download, tampilkan dulu dari R2 Url
            if (isMounted) setImgSrc(imageUrl);

            // Jika bukan pesan kita, download ke Galeri (Filesystem) lalu auto-delete dari server
            if (!isMe) {
              try {
                // Download image as blob
                const response = await fetch(imageUrl);
                const blob = await response.blob();
                
                // Convert blob to base64 for Capacitor Filesystem
                const reader = new FileReader();
                reader.onloadend = async () => {
                  const base64data = reader.result;
                  try {
                    // Save to local device (Documents folder)
                    const fileName = `chat_image_${Date.now()}.jpg`;
                    await Filesystem.writeFile({
                      path: fileName,
                      data: base64data,
                      directory: Directory.Documents
                    });
                    
                    // Save to localforage cache so it doesn't download again
                    await localforage.setItem(`r2_media_${msgId}`, base64data);
                    
                    if (isMounted) {
                      setImgSrc(base64data);
                    }
                    
                    // Trigger Auto Delete from Server after 1 minute (60000 ms)
                    setTimeout(() => {
                      fetch(`${API_URL}/api/messages/media/${msgId}`, { method: 'DELETE' }).catch(console.error);
                    }, 60000);
                    
                  } catch (e) {
                    console.error("Gagal menyimpan ke galeri", e);
                  }
                };
                reader.readAsDataURL(blob);
              } catch (e) {
                console.error("Gagal mengunduh gambar", e);
              }
            }
          }
        } catch (err) {
          if (isMounted) setIsFailed(true);
        }
      };
      loadMedia();
      return () => { isMounted = false; };
    }, [msgId, base64Part, isMe]);

    return (
      <div>
        {imgSrc && !isFailed ? (
          <img 
            src={imgSrc} 
            alt="Gambar" 
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleTouchStart}
            onMouseUp={handleTouchEnd}
            onMouseLeave={handleTouchEnd}
            onClick={(e) => {
              if (selectionMode) return;
              e.stopPropagation();
              if (isHolding) return;
              setPreviewModalImage(imgSrc);
            }}
            style={{ 
              maxWidth: '55cqw', 
              maxHeight: '350px', 
              borderRadius: '2cqw', 
              display: 'block', 
              margin: '0.5cqh 0', 
              objectFit: 'cover',
              cursor: selectionMode ? 'pointer' : 'zoom-in',
              transition: 'transform 0.15s ease'
            }} 
          />
        ) : (
          <div style={{ padding: '1.5cqh 2.5cqw', background: 'rgba(0,0,0,0.2)', borderRadius: '2cqw', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '2cqw', fontSize: 'var(--font-caption)', border: '1px dashed rgba(255,255,255,0.2)', margin: '0.5cqh 0' }}>
            <ImageOff size={18} color="#ef4444" />
            <span>Gambar {isFailed || base64Part === 'MEDIA_DELETED' ? 'telah dihapus (View Once)' : 'sedang dimuat...'}</span>
          </div>
        )}
        {captionPart && <div style={{ marginTop: '1cqh', color: '#e9edef' }}>{captionPart}</div>}
      </div>
    );
  };

const ChatRoom = ({ chat, onBack, currentUser, isFriend }) => {
  const cacheKey = `${currentUser}_${chat.username}`;
  const [messages, setMessages] = useState(cachedMessages[cacheKey] || []);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null); // popup for individual message (legacy)
  const [viewProfileUser, setViewProfileUser] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const isFirstLoad = useRef(true);
  const [loading, setLoading] = useState(!cachedMessages[cacheKey]);
  const [partnerLastSeen, setPartnerLastSeen] = useState(null);
  
  // Long Press State
  const [longPressMessage, setLongPressMessage] = useState(null);
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [showEditModal, setShowEditModal] = useState(null);
  const [editMessageText, setEditMessageText] = useState('');
  const [showDeleteActionModal, setShowDeleteActionModal] = useState(null);
  const pressTimer = useRef(null);
  
  // Selection Mode State
  const [showMenu, setShowMenu] = useState(false);
  const [selectionMode, setSelectionMode] = useState(null); // 'favorite' | 'delete' | null
  const [selectedMessages, setSelectedMessages] = useState(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageCaption, setImageCaption] = useState('');
  const [previewModalImage, setPreviewModalImage] = useState(null);
  

  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  // removed socketRef
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);
  const emojiPickerRef = useRef(null);

  useEffect(() => {
    localforage.getItem(`chat_${cacheKey}`).then(data => {
      if (data && isFirstLoad.current) {
        setMessages(data);
        setLoading(false);
      }
    });
  }, [cacheKey]);

  const handleViewProfile = async (username) => {
    setIsLoadingProfile(true);
    try {
      const res = await fetch(`${API_URL}/api/users/${username}`);
      if (res.ok) {
        const data = await res.json();
        setViewProfileUser({ ...data, username });
      } else {
        notify.error('Gagal memuat profil');
      }
    } catch (err) {
      notify.error('Terjadi kesalahan jaringan');
    } finally {
      setIsLoadingProfile(false);
    }
  };

  useEffect(() => {
    if (!cachedMessages[cacheKey]) {
      localforage.getItem(`messages_${cacheKey}`).then(val => {
        if (val) {
          cachedMessages[cacheKey] = val;
          setMessages(val);
        }
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [cacheKey]);

  useEffect(() => {
    const handleHardwareBack = (e) => {
      e.preventDefault();
      if (previewModalImage) {
        setPreviewModalImage(null);
      } else if (selectedImage) {
        setSelectedImage(null);
        setImageCaption('');
      } else if (showEditModal || showDeleteActionModal || showDeleteModal) {
        setShowEditModal(null);
        setShowDeleteActionModal(null);
        setShowDeleteModal(false);
      } else if (showEmojiPicker) {
        setShowEmojiPicker(false);
      } else if (showMenu) {
        setShowMenu(false);
      } else if (selectionMode) {
        setSelectionMode(null);
        setSelectedMessages(new Set());
      } else if (viewProfileUser) {
        setViewProfileUser(null);
      } else {
        onBack();
      }
    };
    window.addEventListener('hardwareBack', handleHardwareBack);
    return () => window.removeEventListener('hardwareBack', handleHardwareBack);
  }, [previewModalImage, selectedImage, showEditModal, showDeleteActionModal, showDeleteModal, showEmojiPicker, showMenu, selectionMode, viewProfileUser, onBack]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showEmojiPicker]);


  useEffect(() => {
    const handleResize = () => {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 150);
    };
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    } else {
      window.addEventListener('resize', handleResize);
    }
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      } else {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  const scrollToBottom = (behavior = 'smooth') => {
    if (!selectionMode) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior });
      }, 150);
    }
  };

  useEffect(() => {
    if (isFirstLoad.current) {
      scrollToBottom('auto');
      if (messages.length > 0) isFirstLoad.current = false;
    } else {
      scrollToBottom('smooth');
    }
  }, [messages, showEmojiPicker]);

  const fetchMessages = () => {
    fetch(`${API_URL}/api/messages/${currentUser}/${chat.username}`)
      .then(res => {
        const lastSeen = res.headers.get('x-partner-last-seen');
        if (lastSeen) setPartnerLastSeen(lastSeen);
        return res.json().then(data => ({ data, lastSeen }));
      })
      .then(({ data, lastSeen }) => {
        const history = data.map(m => {
          const rawDate = typeof m.created_at === 'string' && !m.created_at.includes('T') ? m.created_at.replace(' ', 'T') + 'Z' : m.created_at;
          
          let msgStatus = 'sent';
          if (!isFriend) {
            msgStatus = 'sent';
          } else if (m.is_read) {
            msgStatus = 'read';
          } else if (lastSeen) {
            const msgTime = new Date(rawDate).getTime();
            const lsTime = new Date(lastSeen.includes('T') ? lastSeen : lastSeen.replace(' ', 'T') + 'Z').getTime();
            if (lsTime >= msgTime) {
              msgStatus = 'delivered';
            }
          }

          return {
            id: m.id,
            text: m.text,
            sender: m.sender === currentUser ? 'me' : (m.sender === 'imo_ai' ? 'imo_ai' : 'them'),
            time: new Date(rawDate).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).replace(/\./g, ':'),
            rawDate: rawDate,
            status: msgStatus,
            is_edited: m.is_edited,
            is_deleted_everyone: m.is_deleted_everyone,
            reply_to: m.reply_to,
            reply_text: m.reply_text,
            reply_sender: m.reply_sender
          };
        });
        
        setMessages(history);
        cachedMessages[cacheKey] = history;
        setLoading(false);
        markMessagesRead();
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchMessages();
    
    const channelName = `user-${currentUser}`;
    const channel = pusher.subscribe(channelName);
    
    const handleNewMessage = (data) => {
      if (data.sender === chat.username || data.recipient === chat.username) {
        fetchMessages();
      }
    };

    const handleMessagesRead = (data) => {
      if (data.by === chat.username) {
        setMessages(prev => {
          const newMessages = prev.map(m => (m.sender === 'me' && m.status !== 'read') ? { ...m, status: 'read' } : m);
          cachedMessages[cacheKey] = newMessages;
          return newMessages;
        });
      }
    };

    channel.bind('new-message', handleNewMessage);
    channel.bind('messages-read', handleMessagesRead);

    return () => {
      channel.unbind('new-message', handleNewMessage);
      channel.unbind('messages-read', handleMessagesRead);
    };
  }, [currentUser, chat.username]);

  const markMessagesRead = () => {
    fetch(`${API_URL}/api/messages/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: chat.username, receiver: currentUser })
    }).catch(console.error);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    
    const textToSend = newMessage;
    setNewMessage('');
    
    const tempId = `temp-${Date.now()}`;
    const newMsg = {
      id: tempId,
      sender: 'me',
      receiver: chat.username,
      text: textToSend,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      rawDate: new Date().toISOString(),
      status: 'sending',
      reply_to: replyingTo?.id || null,
      reply_text: replyingTo?.text || null,
      reply_sender: replyingTo?.sender || null
    };
    
    setMessages(prev => [...prev, newMsg]);
    const currentReplyingTo = replyingTo;
    setReplyingTo(null);
    
    try {
      const res = await fetch(`${API_URL}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: currentUser, recipient: chat.username, text: textToSend, reply_to: currentReplyingTo?.id || null, reply_text: currentReplyingTo?.text || null, reply_sender: currentReplyingTo?.sender || null })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gagal mengirim pesan");
      }
      fetchMessages();
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      notify.error(err.message || "Gagal mengirim pesan");
    }

    if (textToSend.includes('@imo_ai')) {
      setIsAiTyping(true);
      const chatContext = currentUser < chat.username ? currentUser + '|' + chat.username : chat.username + '|' + currentUser;
      const history = messages.slice(-10);
      callImoAI(chatContext, history, textToSend).then(async (reply) => {
        setIsAiTyping(false);
        try {
          const aiRes = await fetch(`${API_URL}/api/messages/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender: 'imo_ai', recipient: chat.username, text: reply, chat_context: chatContext })
          });
          const aiData = await aiRes.json();
          if (!aiData.error) {
            setMessages(prev => [...prev, { 
              ...aiData, 
              sender: 'imo_ai', 
              rawDate: new Date().toISOString(),
              time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
              status: 'sent'
            }]);
          }
        } catch (e) {
          console.error("Failed to send AI response", e);
        }
      });
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1920;
        const MAX_HEIGHT = 1920;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        setSelectedImage(canvas.toDataURL('image/jpeg', 0.7));
        setImageCaption('');
      };
      img.onerror = () => {
        setSelectedImage(reader.result);
        setImageCaption('');
      };
      img.src = reader.result;
    };
    reader.onerror = () => {
      notify.error('Gagal membaca gambar.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const confirmSendImage = async () => {
    if (!selectedImage) return;
    
    try {
        const imgbbKey = import.meta.env.VITE_IMGBB_API_KEY;
        const resBlob = await fetch(selectedImage);
        const blob = await resBlob.blob();
        const formData = new FormData();
        formData.append('image', blob);
        
        const uploadRes = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, {
          method: 'POST',
          body: formData
        });
        if (!uploadRes.ok) {
          throw new Error("Gagal upload gambar ke ImgBB");
        }
        const uploadResData = await uploadRes.json();
        if (!uploadResData.success) {
          throw new Error("ImgBB tidak merespon sukses");
        }
        
        const baseText = `IMGBB_IMAGE|||${uploadResData.data.url}`;
        let textToSend = baseText;
        if (imageCaption.trim()) {
            textToSend = baseText + '|||CAPTION|||' + imageCaption.trim();
        }
      
      const tempId = `temp-${Date.now()}`;
      const newMsg = {
        id: tempId,
        sender: 'me',
        receiver: chat.username,
        text: textToSend,
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        rawDate: new Date().toISOString(),
        status: 'sending',
        reply_to: replyingTo?.id || null,
        reply_text: replyingTo?.text || null,
        reply_sender: replyingTo?.sender || null
      };
      
      setMessages(prev => [...prev, newMsg]);
      const currentReplyingTo = replyingTo;
      setReplyingTo(null);
      setSelectedImage(null);
      setImageCaption('');

      const res = await fetch(`${API_URL}/api/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: currentUser, recipient: chat.username, text: textToSend, reply_to: currentReplyingTo?.id || null, reply_text: currentReplyingTo?.text || null, reply_sender: currentReplyingTo?.sender || null })
      });
      if (!res.ok) {
        throw new Error("Gagal kirim gambar");
      }
      
      const resData = await res.json();
      await localforage.setItem(`r2_media_${resData.id}`, selectedImage);
      
      fetchMessages();
    } catch (err) {
      notify.error("Gagal mengirim gambar: " + err.message);
    }
    setSelectedImage(null);
    setImageCaption('');
  };

  const handleEditSubmit = async () => {
    if (!editMessageText.trim() || !showEditModal) return;
    await fetch(`${API_URL}/api/messages/edit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: showEditModal.id, sender: currentUser, text: editMessageText })
    });
    fetchMessages();
    setShowEditModal(null);
  };

  const handleDeleteForMe = async (msgId) => {
    const res = await fetch(`${API_URL}/api/messages/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser, messageIds: [msgId] })
    });
    if (res.ok) {
      setMessages(messages.filter(m => m.id !== msgId));
      setShowDeleteActionModal(null);
    }
  };

  const handleDeleteForEveryone = async (msgId) => {
    await fetch(`${API_URL}/api/messages/delete_everyone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: msgId, sender: currentUser })
    });
    fetchMessages();
    setShowDeleteActionModal(null);
  };

  const toggleSelection = (id) => {
    const newSet = new Set(selectedMessages);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedMessages(newSet);
  };

  const executeBulkAction = async () => {
    if (selectedMessages.size === 0) return notify.error('Pilih setidaknya satu pesan');
    const messageIds = Array.from(selectedMessages);

    if (selectionMode === 'favorite') {
      try {
        const res = await fetch(`${API_URL}/api/messages/favorite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: currentUser, messageIds })
        });
        if (res.ok) {
          notify.success('Berhasil DiFavoritkan');
          setSelectionMode(null);
          setSelectedMessages(new Set());
        } else {
          notify.error('Gagal menyimpan favorit');
        }
      } catch (err) {
        notify.error('Kesalahan jaringan');
      }
    } else if (selectionMode === 'delete') {
      setShowDeleteModal(true);
    }
  };

  const confirmDeleteMessages = async () => {
    const messageIds = Array.from(selectedMessages);
    setIsDeleting(true);
    try {
      const res = await fetch(`${API_URL}/api/messages/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, messageIds })
      });
      if (res.ok) {
        setMessages(messages.filter(m => !selectedMessages.has(m.id)));
        notify.success('Pesan berhasil dihapus');
        setSelectionMode(null);
        setSelectedMessages(new Set());
        setShowDeleteModal(false);
      } else {
        notify.error('Gagal menghapus pesan');
      }
    } catch (err) {
      notify.error('Kesalahan jaringan');
    } finally {
      setIsDeleting(false);
    }
  };

  const renderMediaContent = (msg, isMe) => {
    const rawText = msg.text;
    const msgId = msg.id;
    if (typeof rawText !== 'string') return rawText;

    let base64Part = null;
    let captionPart = null;

    if (rawText.includes('|||CAPTION|||')) {
      const parts = rawText.split('|||CAPTION|||');
      base64Part = parts[0];
      captionPart = parts[1];
    } else {
      base64Part = rawText;
    }

    if (base64Part.startsWith('data:image/') || base64Part.startsWith('R2_IMAGE|||') || base64Part.startsWith('IMGBB_IMAGE|||') || base64Part === 'MEDIA_DELETED' || base64Part === 'MEDIA_LOCAL_SAVED') {
      return (
        <MediaMessage 
          msg={msg}
          base64Part={base64Part} 
          captionPart={captionPart} 
          isMe={isMe} 
          selectionMode={selectionMode}
          setPreviewModalImage={setPreviewModalImage}
          setLongPressMessage={setLongPressMessage}
        />
      );
    }
    
    return rawText;
  };

  const renderMessages = () => {
    const getReplyThumbnail = (text) => {
      if (!text) return null;
      if (text.startsWith('IMGBB_IMAGE|||')) return text.split('|||')[1];
      if (text.startsWith('R2_IMAGE|||')) return text.split('|||')[2];
      if (text.startsWith('data:image/')) return text.includes('|||CAPTION|||') ? text.split('|||CAPTION|||')[0] : text;
      return null;
    };
    const getReplyText = (text) => {
      if (!text) return '';
      if (text.includes('|||CAPTION|||')) return '📷 ' + text.split('|||CAPTION|||')[1];
      if (text.startsWith('IMGBB_IMAGE|||') || text.startsWith('R2_IMAGE|||') || text.startsWith('data:image/') || text === 'MEDIA_LOCAL_SAVED' || text === 'MEDIA_DELETED') return '📷 Foto';
      return text;
    };

    const elements = [];
    let lastDateLabel = null;

    messages.forEach((msg, index) => {
      const currentLabel = formatDateDivider(msg.rawDate);
      if (currentLabel !== lastDateLabel) {
        elements.push(
          <div key={`date-${currentLabel}-${index}`} style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 16px 0' }}>
            <div style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', color: 'var(--dark-text-muted)' }}>
              {currentLabel}
            </div>
          </div>
        );
        lastDateLabel = currentLabel;
      }

      const isEmojiOnly = msg.is_deleted_everyone !== 1 && !msg.reply_to && (function(str) {
        if (!str || typeof str !== 'string' || str.includes('|||')) return false;
        const noSpace = str.replace(/\s+/g, '');
        if (noSpace.length === 0) return false;
        const remaining = noSpace.replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{200D}\u{FE0F}]/gu, '');
        return remaining.length === 0;
      })(msg.text);

      elements.push(
        <div key={msg.id + '-' + index} style={{
          alignSelf: msg.sender === 'me' ? 'flex-end' : 'flex-start',
          maxWidth: '80%',
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px'
        }}
        >
          {msg.sender === 'imo_ai' && (
            <img 
              src="https://api.dicebear.com/7.x/bottts/svg?seed=imo_ai" 
              alt="AI" 
              style={{ width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0, marginTop: '2px', background: '#1e293b' }}
            />
          )}
          <div style={{
            background: isEmojiOnly ? 'transparent' : (msg.sender === 'me' ? '#005c4b' : (msg.sender === 'imo_ai' ? '#1e293b' : '#202c33')),
            color: msg.sender === 'imo_ai' ? '#38bdf8' : '#e9edef',
            fontFamily: msg.sender === 'imo_ai' ? '"Courier New", Courier, monospace' : 'inherit',
            padding: msg.image_url ? '4px' : (isEmojiOnly ? '0' : '6px 7px 8px 9px'),
            borderRadius: '7.5px',
            borderTopRightRadius: msg.sender === 'me' ? '0px' : '7.5px',
            borderTopLeftRadius: msg.sender === 'me' ? '7.5px' : '0px',
            fontSize: isEmojiOnly ? '42px' : '14.2px',
            lineHeight: isEmojiOnly ? '1.2' : '19px',
            cursor: selectionMode ? 'pointer' : 'default',
            wordBreak: 'break-word',
            boxShadow: isEmojiOnly ? 'none' : '0 1px 0.5px rgba(11,20,26,.13)',
            display: 'inline-block',
            position: 'relative',
            border: selectedMessages.has(msg.id) ? '2px solid var(--primary)' : '2px solid transparent',
            boxSizing: 'border-box'
          }} onClick={() => { 
            if (selectionMode) {
              toggleSelection(msg.id); 
            } else {
              setLongPressMessage(msg);
            }
          }}>
            
            {selectionMode && (
              <div style={{
                position: 'absolute',
                top: '-8px',
                right: '-8px',
                background: 'var(--dark-surface)',
                borderRadius: '50%',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                zIndex: 10
              }}>
                <input
                  type="checkbox"
                  checked={selectedMessages.has(msg.id)}
                  readOnly
                  style={{ pointerEvents: 'none', width: '16px', height: '16px', margin: 0 }}
                />
              </div>
            )}
            {msg.is_deleted_everyone === 1 ? (
              <span style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '4px', paddingRight: '40px', paddingBottom: '4px' }}>
                <Ban size={14} /> Pesan ini telah dihapus
              </span>
            ) : (
              <div style={{ display: 'inline' }}>
                {msg.reply_to && msg.reply_text && (
                  <div 
                    onClick={(e) => { e.stopPropagation(); const el = document.getElementById(`msg-${msg.reply_to}`); if(el) { el.scrollIntoView({behavior: 'smooth', block: 'center'}); el.classList.add('blink-once'); setTimeout(() => el.classList.remove('blink-once'), 2000); } }}
                    style={{ background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: '6px', borderLeft: '4px solid var(--primary)', marginBottom: '6px', cursor: 'pointer', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                      <span style={{ color: 'var(--primary)', fontSize: '12px', fontWeight: 'bold' }}>{msg.reply_sender === currentUser ? 'Anda' : (msg.reply_sender === chat.username ? chat.name : msg.reply_sender)}</span>
                      <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {getReplyText(msg.reply_text)}
                      </span>
                    </div>
                    {getReplyThumbnail(msg.reply_text) && (
                      <img src={getReplyThumbnail(msg.reply_text)} alt="thumbnail" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
                    )}
                  </div>
                )}
                {renderMediaContent(msg, msg.sender === 'me')}
                <span style={{ display: 'inline-block', width: msg.sender === 'me' ? '50px' : '40px', height: '10px' }} />
              </div>
            )}
            <div style={{ 
              position: 'absolute',
              right: isEmojiOnly ? '-4px' : '4px',
              bottom: isEmojiOnly ? '-4px' : '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              color: isEmojiOnly ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)',
              background: isEmojiOnly ? 'rgba(0,0,0,0.3)' : 'transparent',
              padding: isEmojiOnly ? '2px 6px' : '0',
              borderRadius: isEmojiOnly ? '10px' : '0',
              zIndex: 1
            }}>
              {msg.is_edited === 1 && msg.is_deleted_everyone !== 1 && <span style={{ fontStyle: 'italic', fontSize: '10px', marginRight: '4px' }}>(diedit)</span>}
              {msg.time}
              {msg.sender === 'me' && msg.is_deleted_everyone !== 1 && (
                msg.status === 'sending' ? <Clock size={14} color="rgba(255,255,255,0.6)" /> :
                msg.status === 'sent' ? <Check size={15} /> : 
                <CheckCheck size={15} color={msg.status === 'read' ? '#53bdeb' : 'rgba(255,255,255,0.6)'} />
              )}
            </div>
          </div>
        </div>
      );
    });
    return elements;
  };

  return (
    <div className="chat-app" style={{ zIndex: 50, background: 'var(--dark-bg)' }}>
      {/* Header */}
      <div className="chat-header-bar" style={{ position: 'relative', zIndex: 60, margin: 0, background: 'var(--dark-surface)' }}>
        {selectionMode ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4cqw', width: '100%' }}>
            <X size={24} style={{ cursor: 'pointer', color: 'white' }} onClick={() => { setSelectionMode(null); setSelectedMessages(new Set()); }} />
            <span style={{ fontSize: 'var(--font-body)', fontWeight: 600, color: 'white' }}>{selectedMessages.size} dipilih</span>
            <div style={{ flex: 1 }} />
            <button onClick={executeBulkAction} style={{ background: selectionMode === 'favorite' ? 'var(--primary)' : '#EF4444', border: 'none', padding: '1.5cqh 4cqw', borderRadius: '2cqw', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
              {selectionMode === 'favorite' ? 'Favorit' : 'Hapus'}
            </button>
          </div>
        ) : (
          <>
            <div className="header-left">
              <ArrowLeft size={24} style={{ cursor: 'pointer', color: 'white' }} onClick={onBack} />
              <div className="avatar-container" onClick={() => !chat.isDeleted && handleViewProfile(chat.username)} style={{ cursor: chat.isDeleted ? 'default' : 'pointer' }}>
                {chat.isDeleted ? (
                  <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#3f3f46', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#a1a1aa', fontWeight: 'bold' }}>
                    X
                  </div>
                ) : chat.avatar ? (
                  <img src={chat.avatar} alt={chat.name} className="avatar" />
                ) : (
                  <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'linear-gradient(135deg, #A48BFF, #651FFF)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontWeight: 'bold' }}>
                    {chat.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 'var(--font-body)', fontWeight: 600, color: chat.isDeleted ? '#a1a1aa' : (chat.name === 'admin1' || chat.username === 'admin1' ? '#ff4444' : chat.name === 'admin2' || chat.username === 'admin2' ? '#8b0000' : 'white'), fontStyle: chat.isDeleted ? 'italic' : 'normal', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {chat.isDeleted ? 'Deleted Account' : chat.name} {chat.isSystem && <span style={{ fontSize: '12px' }}>⭐</span>}
                </span>
                <span style={{ fontSize: 'var(--font-caption)', color: isTyping ? 'var(--primary)' : 'rgba(255,255,255,0.7)', fontStyle: isTyping ? 'italic' : 'normal', fontWeight: isTyping ? 500 : 'normal', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {isTyping ? (
                    <>Sedang mengetik<span className="typing-dots"></span></>
                  ) : (
                    (() => {
                      if (chat.isDeleted) return 'Akun telah dihapus';
                      if (chat.isSystem) return 'Sistem Chat';
                      if (partnerLastSeen === '') return 'Belum pernah online';
                      if (!isFriend) return 'Tidak berteman';
                      if (!partnerLastSeen) return 'Memuat status...';
                      
                      const lastSeenStr = partnerLastSeen.includes('T') ? partnerLastSeen : partnerLastSeen.replace(' ', 'T') + 'Z';
                      const last = new Date(lastSeenStr).getTime();
                      const now = Date.now();
                      const diffMinutes = (now - last) / (1000 * 60);
                      const diffHours = diffMinutes / 60;
                      
                      if (diffMinutes < 2) {
                        return (
                          <>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }}></span>
                            Sedang online
                          </>
                        );
                      }
                      if (diffHours < 24) {
                        return `Terakhir online ${new Date(last).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).replace(/\./g, ':')}`;
                      }
                      const diffDays = Math.floor(diffHours / 24);
                      return `Terakhir online ${diffDays} hari yang lalu`;
                    })()
                  )}
                </span>
              </div>
            </div>
            <div className="header-actions" style={{ position: 'relative', display: 'flex', alignItems: 'center' }} ref={menuRef}>
              <div onClick={() => setShowMenu(!showMenu)} style={{ cursor: 'pointer', display: 'flex', padding: '1cqw' }}>
                <MoreVertical size={24} />
              </div>
              {showMenu && (
                <div style={{ position: 'absolute', top: '100%', right: 0, background: 'var(--dark-surface)', border: '1px solid var(--dark-border)', borderRadius: '2cqw', padding: '2cqw', display: 'flex', flexDirection: 'column', gap: '1cqw', zIndex: 60, minWidth: '30cqw', boxShadow: '0 1cqh 3cqh rgba(0,0,0,0.5)' }}>
                  <button onClick={() => { setSelectionMode('favorite'); setShowMenu(false); }} style={{ background: 'transparent', border: 'none', color: 'white', padding: '2cqw 3cqw', textAlign: 'left', cursor: 'pointer', borderRadius: '1cqw', display: 'flex', alignItems: 'center', gap: '2cqw' }}>
                    <Star size={16} /> Favorite
                  </button>
                  <button onClick={() => { setSelectionMode('delete'); setShowMenu(false); }} style={{ background: 'transparent', border: 'none', color: '#EF4444', padding: '2cqw 3cqw', textAlign: 'left', cursor: 'pointer', borderRadius: '1cqw', display: 'flex', alignItems: 'center', gap: '2cqw' }}>
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Messages Area */}
      <div className="chat-list" style={{ flex: 1, padding: '4px 16px 20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
        {loading && <div style={{ textAlign: 'center', marginTop: '20px' }}><Loader2 className="animate-spin" color="var(--primary)" /></div>}
        
        {!loading && messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--dark-text-muted)', marginTop: '10cqh', fontSize: 'var(--font-body)' }}>
            Belum ada pesan. Mulai obrolan dengan {chat.name}!
          </div>
        )}

        {renderMessages()}

        {isTyping && (
          <div style={{ alignSelf: 'flex-start', background: 'var(--dark-surface)', padding: '3cqh 4cqw', borderRadius: '4cqw', borderBottomLeftRadius: '1cqw', display: 'flex', gap: '1cqw' }}>
            <div className="typing-dot" style={{ width: '1.5cqw', height: '1.5cqw', background: 'var(--dark-text-muted)', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both' }}></div>
            <div className="typing-dot" style={{ width: '1.5cqw', height: '1.5cqw', background: 'var(--dark-text-muted)', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }}></div>
            <div className="typing-dot" style={{ width: '1.5cqw', height: '1.5cqw', background: 'var(--dark-text-muted)', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }}></div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      {replyingTo && (
        <div style={{ background: 'var(--dark-surface)', padding: '10px 4cqw', borderTop: '1px solid var(--dark-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden', borderLeft: '3px solid var(--primary)', paddingLeft: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 600 }}>Membalas {replyingTo.sender === 'me' ? 'Anda' : chat.name}</span>
            <span style={{ fontSize: '14px', color: 'var(--dark-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {replyingTo.text.includes('|||CAPTION|||') ? '📷 Foto' : replyingTo.text.startsWith('data:image/') || replyingTo.text === 'MEDIA_LOCAL_SAVED' ? '📷 Foto' : replyingTo.text}
            </span>
          </div>
          <X size={20} style={{ color: 'var(--dark-text-muted)', cursor: 'pointer', flexShrink: 0, paddingLeft: '10px' }} onClick={() => setReplyingTo(null)} />
        </div>
      )}
      
        {isAiTyping && (
          <div style={{ padding: '4px 16px', fontSize: '12px', color: 'var(--primary)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '8px' }}>
             <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> imo_ai sedang mengetik...
          </div>
        )}
        <form onSubmit={handleSend} style={{ position: 'relative', padding: '0 4cqw', display: 'flex', gap: '3cqw', background: 'var(--dark-surface)', borderTop: replyingTo ? 'none' : '1px solid var(--dark-border)', alignItems: 'center', minHeight: '70px', maxHeight: '70px', boxSizing: 'border-box', flexShrink: 0 }}>
          {showMentionPopup && (
            <div style={{ position: 'absolute', bottom: '100%', left: '2cqw', marginBottom: '8px', background: 'var(--dark-surface)', padding: '10px 16px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', border: '1px solid var(--dark-border)', zIndex: 100, display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                 onClick={() => {
                     setNewMessage(prev => prev.replace(/@imo$|@Imo$|@imo_ai$|@$/, '@imo_ai '));
                     setShowMentionPopup(false);
                     inputRef.current?.focus();
                 }}>
              <div style={{ fontSize: '20px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🤖</div>
              <div style={{ color: 'white', fontWeight: 'bold', fontSize: '14px' }}>imo_ai <span style={{ color: 'var(--dark-text-muted)', fontSize: '12px', fontWeight: 'normal' }}>- Asisten AI</span></div>
            </div>
          )}
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleImageUpload}
          disabled={chat.isDeleted || !!selectionMode}
        />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <ImageIcon 
            size={24} 
            style={{ cursor: (chat.isDeleted || selectionMode) ? 'not-allowed' : 'pointer', color: (chat.isDeleted || selectionMode) ? '#52525b' : 'var(--dark-text-muted)', display: 'block' }} 
            onClick={() => !chat.isDeleted && !selectionMode && fileInputRef.current?.click()} 
          />
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }} ref={emojiPickerRef}>
          <Smile
            size={24}
            style={{ cursor: (chat.isDeleted || selectionMode) ? 'not-allowed' : 'pointer', color: (chat.isDeleted || selectionMode) ? '#52525b' : showEmojiPicker ? 'var(--primary)' : 'var(--dark-text-muted)', display: 'block' }}
            onClick={() => !chat.isDeleted && !selectionMode && setShowEmojiPicker(!showEmojiPicker)}
          />
          {showEmojiPicker && !chat.isDeleted && !selectionMode && (
            <div style={{ position: 'absolute', bottom: '50px', left: '-40px', zIndex: 50 }}>
              <EmojiPicker 
                onEmojiClick={(emojiObject) => {
                  setNewMessage(prev => prev + emojiObject.emoji);
                }}
                theme="dark"
                searchDisabled={true}
                skinTonesDisabled={true}
                style={{ width: '90vw', maxWidth: '320px' }}
                categories={[
                  { name: 'Baru Dipakai', category: Categories.SUGGESTED },
                  { name: 'Emot Wajah', category: Categories.SMILEYS_PEOPLE },
                  { name: 'Lope Lope', category: Categories.SYMBOLS }
                ]}
              />
            </div>
          )}
        </div>
        <input 
          ref={inputRef}
          type="text" 
          value={newMessage}
          onChange={(e) => {
            const val = e.target.value;
            setNewMessage(val);
            if (val.endsWith('@') || val.endsWith('@Imo') || val.endsWith('@imo') || val.endsWith('@imo_ai')) {
              setShowMentionPopup(true);
            } else {
              setShowMentionPopup(false);
            }
          }}
          placeholder={chat.isDeleted ? "Anda tidak dapat membalas percakapan ini" : "Ketik pesan..."}
          disabled={chat.isDeleted || !!selectionMode}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.05)',
            border: 'none',
            borderRadius: '5cqw',
            padding: '2cqh 4cqw',
            color: (chat.isDeleted || selectionMode) ? '#a1a1aa' : 'white',
            outline: 'none',
            fontSize: 'var(--font-body)',
            cursor: (chat.isDeleted || selectionMode) ? 'not-allowed' : 'text'
          }}
        />
        <button type="submit" disabled={chat.isDeleted || !!selectionMode} style={{ 
          background: (chat.isDeleted || selectionMode) ? '#3f3f46' : 'var(--primary)', 
          border: 'none', 
          width: '9.5cqw', 
          height: '9.5cqw', 
          borderRadius: '50%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          cursor: (chat.isDeleted || selectionMode) ? 'not-allowed' : 'pointer',
          color: (chat.isDeleted || selectionMode) ? '#52525b' : 'white',
          flexShrink: 0
        }}>
          <Send size={18} style={{ marginLeft: '0.5cqw' }} />
        </button>
      </form>
      
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div style={{ 
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000, padding: '5cqw'
        }}>
          <div style={{ 
            background: 'var(--dark-surface)', 
            padding: '5cqw', 
            borderRadius: '4cqw', 
            width: '90%', 
            border: '1px solid var(--dark-border)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <h3 style={{ margin: '0 0 3cqh 0', fontSize: 'var(--font-title)', color: 'white' }}>
              Hapus Pesan?
            </h3>
            <p style={{ color: 'var(--dark-text-muted)', fontSize: 'var(--font-body)', marginBottom: '4cqh', lineHeight: '1.5' }}>
              Anda yakin ingin menghapus pesan yang dipilih? Pesan yang dihapus tidak dapat dikembalikan.
            </p>
            <div style={{ display: 'flex', gap: '3cqw' }}>
              <button onClick={() => setShowDeleteModal(false)} disabled={isDeleting} style={{ flex: 1, padding: '1.5cqh 3cqw', background: 'transparent', border: '1px solid var(--dark-border)', color: 'white', borderRadius: '2cqw', cursor: 'pointer', opacity: isDeleting ? 0.5 : 1, fontSize: 'var(--font-body)' }}>
                Batal
              </button>
              <button onClick={confirmDeleteMessages} disabled={isDeleting} style={{ flex: 1, padding: '1.5cqh 3cqw', background: '#EF4444', border: 'none', color: 'white', borderRadius: '2cqw', cursor: 'pointer', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2cqw', opacity: isDeleting ? 0.7 : 1, fontSize: 'var(--font-body)' }}>
                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview & Caption Modal */}
      {selectedImage && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)',
          display: 'flex', flexDirection: 'column', zIndex: 1000,
          boxSizing: 'border-box'
        }}>
          {/* Top Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3cqh 4cqw' }}>
            <span style={{ color: 'white', fontWeight: 600, fontSize: 'var(--font-title)' }}>Kirim Gambar</span>
            <X size={24} color="white" style={{ cursor: 'pointer' }} onClick={() => { setSelectedImage(null); setImageCaption(''); }} />
          </div>

          {/* Image Preview Container */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2cqh 4cqw', overflow: 'hidden' }}>
            <img 
              src={selectedImage} 
              alt="Preview" 
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                display: 'block',
                objectFit: 'contain',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                boxShadow: 'none',
                borderRadius: 0
              }} 
            />
          </div>

          {/* Caption Input & Send Controls */}
          <div style={{ padding: '2.5cqh 4cqw calc(2.5cqh + env(safe-area-inset-bottom, 24px)) 4cqw', display: 'flex', gap: '3cqw', background: 'var(--dark-surface)', borderTop: '1px solid var(--dark-border)', alignItems: 'center' }}>
            <input 
              type="text" 
              value={imageCaption}
              onChange={(e) => setImageCaption(e.target.value)}
              placeholder="Tambah keterangan (opsional)..."
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') confirmSendImage(); }}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                borderRadius: '5cqw',
                padding: '2cqh 4cqw',
                color: 'white',
                outline: 'none',
                fontSize: 'var(--font-body)'
              }}
            />
            <button 
              onClick={confirmSendImage} 
              style={{ 
                background: 'var(--primary)', 
                border: 'none', 
                width: '9.5cqw', 
                height: '9.5cqw', 
                borderRadius: '50%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'white',
                flexShrink: 0
              }}
            >
              <Send size={18} style={{ marginLeft: '0.5cqw' }} />
            </button>
          </div>
        </div>
      )}

      {/* Long Press Action Modal */}
      {longPressMessage && (
        <div onClick={() => setLongPressMessage(null)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--dark-surface)', padding: '12px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '200px' }}>
            {longPressMessage.sender === 'me' && longPressMessage.is_deleted_everyone !== 1 && (
              <div onClick={() => { setEditMessageText(longPressMessage.text.replace('|||CAPTION|||', '')); setShowEditModal(longPressMessage); setLongPressMessage(null); }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', cursor: 'pointer', color: 'white' }}>
                <Edit2 size={18} /> Edit Pesan
              </div>
            )}
            <div onClick={() => { setReplyingTo(longPressMessage); setLongPressMessage(null); }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', cursor: 'pointer', color: 'white' }}>
              <Reply size={18} /> Balas
            </div>
            <div onClick={() => { setShowDeleteActionModal(longPressMessage); setLongPressMessage(null); }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', cursor: 'pointer', color: '#EF4444' }}>
              <Trash2 size={18} /> Hapus Pesan
            </div>
          </div>
        </div>
      )}

      {/* Delete Action Modal */}
      {showDeleteActionModal && (
        <div onClick={() => setShowDeleteActionModal(null)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--dark-surface)', padding: '20px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '250px' }}>
            <h3 style={{ margin: 0, color: 'white', fontSize: '16px', textAlign: 'center', marginBottom: '8px' }}>Hapus Pesan?</h3>
            <div onClick={() => handleDeleteForMe(showDeleteActionModal.id)} style={{ padding: '12px', textAlign: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', cursor: 'pointer', color: 'white' }}>
              Hapus untuk saya
            </div>
            {showDeleteActionModal.sender === 'me' && showDeleteActionModal.is_deleted_everyone !== 1 && (
              <div onClick={() => handleDeleteForEveryone(showDeleteActionModal.id)} style={{ padding: '12px', textAlign: 'center', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', cursor: 'pointer', color: '#EF4444' }}>
                Hapus untuk semua
              </div>
            )}
            <div onClick={() => setShowDeleteActionModal(null)} style={{ padding: '12px', textAlign: 'center', cursor: 'pointer', color: 'var(--dark-text-muted)' }}>
              Batal
            </div>
          </div>
        </div>
      )}

      {/* Edit Message Modal */}
      {showEditModal && (
        <div onClick={() => setShowEditModal(null)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--dark-surface)', padding: '20px', borderRadius: '16px', width: '90%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0, color: 'white', fontSize: '16px' }}>Edit Pesan</h3>
            <input 
              type="text" 
              value={editMessageText}
              onChange={e => setEditMessageText(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', outline: 'none' }}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setShowEditModal(null)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'white', cursor: 'pointer' }}>Batal</button>
              <button onClick={handleEditSubmit} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>Simpan</button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
      `}} />

      {/* Loading Profile Popup */}
      {isLoadingProfile && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Loader2 className="animate-spin" size={32} color="var(--primary)" />
        </div>
      )}

      {/* View Profile Popup */}
      {viewProfileUser && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10000, backdropFilter: 'blur(4px)' }} onClick={() => setViewProfileUser(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--dark-surface)', borderRadius: '6cqw', padding: '8cqw 6cqw', width: '90%', maxWidth: '85vw', zIndex: 10001, border: '1px solid var(--dark-border)', boxShadow: '0 5cqh 6cqh -1cqh rgba(0, 0, 0, 0.5)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div 
              style={{ width: '20cqw', height: '20cqw', borderRadius: '50%', background: 'linear-gradient(135deg, #A48BFF, #651FFF)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '8cqw', marginBottom: '4cqh', overflow: 'hidden', cursor: viewProfileUser.avatar ? 'pointer' : 'default' }}
              onClick={() => viewProfileUser.avatar && setPreviewModalImage(viewProfileUser.avatar)}
            >
              {viewProfileUser.avatar ? <img src={viewProfileUser.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : viewProfileUser.username.charAt(0).toUpperCase()}
            </div>
            <h2 style={{ margin: '0 0 1cqh 0', fontSize: '5cqw', color: 'white' }}>{viewProfileUser.display_name || viewProfileUser.username}</h2>
            <div style={{ fontSize: 'var(--font-body)', color: 'var(--primary)', marginBottom: '5cqh' }}>@{viewProfileUser.username}</div>
            
            <div style={{ background: 'var(--dark-bg)', padding: '4cqw', borderRadius: '3cqw', width: '100%', marginBottom: '6cqh', border: '1px solid var(--dark-border)' }}>
              <div style={{ fontSize: 'var(--font-caption)', color: 'var(--dark-text-muted)', marginBottom: '2cqh', textTransform: 'uppercase', letterSpacing: '1px' }}>Bio</div>
              <div style={{ fontSize: 'var(--font-body)', color: 'white', lineHeight: '1.5' }}>
                {viewProfileUser.bio || 'Tidak ada bio.'}
              </div>
            </div>
            
            <button onClick={() => setViewProfileUser(null)} style={{ width: '100%', padding: '3.5cqw', borderRadius: '3cqw', background: 'var(--primary)', border: 'none', color: 'white', fontWeight: '600', cursor: 'pointer' }}>
              Tutup
            </button>
          </div>
        </>
      )}

      {/* Lightbox Modal */}
      {previewModalImage && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(8px)',
          zIndex: 10002, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center', padding: '2cqh'
        }} onClick={() => setPreviewModalImage(null)}>
          <div style={{ position: 'absolute', top: '4cqh', right: '4cqw', display: 'flex', gap: '4cqw', zIndex: 10003 }}>
            <X size={24} color="white" style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.2)', padding: '2cqw', borderRadius: '50%' }} onClick={(e) => { e.stopPropagation(); setPreviewModalImage(null); }} />
          </div>
          <img src={previewModalImage} alt="Fullscreen Preview" style={{ maxWidth: '100%', maxHeight: '80%', objectFit: 'contain', marginBottom: '4cqh' }} onClick={(e) => e.stopPropagation()} />
          <div 
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const res = await fetch(previewModalImage);
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = `chatapp-image-${Date.now()}.jpg`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
                notify.success('Gambar disimpan!');
              } catch (err) {
                console.error('Download failed', err);
                window.open(previewModalImage, '_blank');
              }
            }}
            style={{
              background: 'rgba(255,255,255,0.15)',
              padding: '2cqw 4cqw',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '2cqw',
              cursor: 'pointer',
              color: 'white',
              fontSize: '3.5cqw',
              fontWeight: '500',
              border: '1px solid rgba(255,255,255,0.3)',
              backdropFilter: 'blur(4px)'
            }}
          >
            <Download size={16} /> Simpan Gambar
          </div>
        </div>
      )}

    </div>
  );
};

export default ChatRoom;
