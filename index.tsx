
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { motion, AnimatePresence, useScroll, useTransform, useAnimation, PanInfo } from "framer-motion";
import { 
  Home, Search, PlusSquare, MessageCircle, User, 
  Heart, Share2, MoreHorizontal, Camera, Sparkles, 
  MapPin, Music2, Send, Zap, Bookmark, ChevronLeft, Phone, Video, X, Settings,
  Trash2,
} from "lucide-react";
import { GoogleGenAI } from "@google/genai";
import { SettingsDashboard } from "./SettingsDashboard";

// --- Configuration & Constants ---
const APP_NAME = "My Social";
const API_KEY = process.env.API_KEY;

// --- Types ---
interface Story {
  id: number;
  user: string;
  img: string;
  avatar?: string;
  isUser?: boolean;
  videoKey?: string;
  createdAt?: number;
  viewers?: string[];
}

interface Comment {
  id: number;
  user: string;
  text: string;
  avatar?: string;
}

interface Post {
  id: number;
  user: string;
  avatar: string;
  image: string;
  likes: number;
  caption: string;
  location?: string;
  liked: boolean;
  comments?: Comment[];
  isReel?: boolean;
  videoUrl?: string;
  videoKey?: string;
}

interface UserProfile {
  name: string;
  username: string;
  bio: string;
  website: string;
  avatar: string;
  stats: {
    posts: string;
    followers: string;
    following: string;
  };
}

interface Message {
  id: string;
  text: string;
  senderId: string; // 'me' or user handle
  timestamp: Date;
}

interface Conversation {
  id: string;
  user: {
    name: string;
    username: string;
    avatar: string;
    isOnline: boolean;
  };
  messages: Message[];
  unreadCount: number;
}

// --- Mock Data ---
const INITIAL_PROFILE: UserProfile = {
  name: "Alex User",
  username: "alex_designs",
  bio: "Digital Artist & Developer 🌐\nBuilding the metaverse one pixel at a time.",
  website: "mysocial.app/alex",
  avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop",
  stats: {
    posts: "1.2k",
    followers: "84k",
    following: "350"
  }
};

// --- Media storage (IndexedDB): large videos can't live in localStorage ---
const MEDIA_DB = "mysocial_media";
const MEDIA_STORE = "blobs";
const MAX_VIDEO_MB = 200;

const openMediaDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(MEDIA_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(MEDIA_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const saveMedia = async (key: string, blob: Blob): Promise<void> => {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, "readwrite");
    tx.objectStore(MEDIA_STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const loadMedia = async (key: string): Promise<Blob | null> => {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(MEDIA_STORE, "readonly").objectStore(MEDIA_STORE).get(key);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
};

const deleteMedia = async (key: string): Promise<void> => {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, "readwrite");
    tx.objectStore(MEDIA_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const useStoredVideoUrl = (key?: string, remoteUrl?: string) => {
  const [url, setUrl] = useState<string | undefined>(remoteUrl);
  useEffect(() => {
    if (!key) {
      setUrl(remoteUrl);
      return;
    }
    let objectUrl: string | undefined;
    let cancelled = false;
    loadMedia(key)
      .then((blob) => {
        if (blob && !cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch((e) => console.error("Failed to load video", e));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key, remoteUrl]);
  return url;
};

const StoredVideo: React.FC<{ videoKey?: string; videoUrl?: string } & React.VideoHTMLAttributes<HTMLVideoElement>> = ({
  videoKey,
  videoUrl,
  ...rest
}) => {
  const src = useStoredVideoUrl(videoKey, videoUrl);
  if (!src) return <div className={rest.className} />;
  return <video src={src} playsInline preload="metadata" {...rest} />;
};

const drawToJpeg = (source: CanvasImageSource, w: number, h: number, maxSide: number, quality = 0.82): string => {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
};

const readImageAsJpeg = (file: Blob, maxSide = 1080): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        resolve(drawToJpeg(img, img.naturalWidth, img.naturalHeight, maxSide));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });

const readVideoPoster = (file: Blob): Promise<{ poster: string; duration: number }> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;
    const finish = (fn: () => void) => {
      URL.revokeObjectURL(url);
      fn();
    };
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      try {
        const poster = drawToJpeg(video, video.videoWidth, video.videoHeight, 720);
        finish(() => resolve({ poster, duration: video.duration || 0 }));
      } catch (e) {
        finish(() => reject(e));
      }
    };
    video.onerror = () => finish(() => reject(new Error("video")));
  });

const INITIAL_STORIES: Story[] = [
  { id: 1, user: "alex_designs", img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=800&fit=crop", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop" },
  { id: 2, user: "sarah_travels", img: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&h=800&fit=crop", avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop" },
  { id: 3, user: "future_tech", img: "https://images.unsplash.com/photo-1526045612212-70caf35c14df?w=400&h=800&fit=crop", avatar: "https://images.unsplash.com/photo-1526045612212-70caf35c14df?w=100&h=100&fit=crop" },
  { id: 4, user: "music_vibe", img: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=400&h=800&fit=crop", avatar: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=100&h=100&fit=crop" },
  { id: 5, user: "jason_dev", img: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=800&fit=crop", avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop" },
];

const INITIAL_POSTS: Post[] = [
  {
    id: 101,
    user: "neon_dreamer",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
    image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&h=1000&fit=crop",
    likes: 1240,
    caption: "Lost in the datastream. 🌌 #cyberpunk #future",
    location: "Neo Tokyo",
    liked: false,
  },
  {
    id: 102,
    user: "minimal_arch",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
    image: "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800&h=1000&fit=crop",
    likes: 856,
    caption: "Geometry is the language of the universe.",
    location: "Berlin, Germany",
    liked: true,
  },
  {
    id: 103,
    user: "coffee_vibes",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop",
    image: "https://images.unsplash.com/photo-1497935586351-b67a49e012bf?w=800&h=1000&fit=crop",
    likes: 2190,
    caption: "Morning starts with the perfect brew. ☕✨",
    location: "Seattle, WA",
    liked: true,
  },
  {
    id: 104,
    user: "nature_lens",
    avatar: "https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=100&h=100&fit=crop",
    image: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&h=1000&fit=crop",
    likes: 4320,
    caption: "Breathe in the wild air. 🌲⛰️",
    location: "Swiss Alps",
    liked: false,
  }
];

const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: "1",
    user: {
      name: "Sarah Jenkins",
      username: "sarah_travels",
      avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=200&fit=crop",
      isOnline: true,
    },
    messages: [
      { id: "m1", text: "Hey! Are you going to the gallery opening tonight?", senderId: "sarah_travels", timestamp: new Date(Date.now() - 1000 * 60 * 60) },
      { id: "m2", text: "I think so! What time does it start?", senderId: "me", timestamp: new Date(Date.now() - 1000 * 60 * 30) },
      { id: "m3", text: "Around 8pm. See you there!", senderId: "sarah_travels", timestamp: new Date(Date.now() - 1000 * 60 * 5) },
    ],
    unreadCount: 1,
  },
  {
    id: "2",
    user: {
      name: "Jason Dev",
      username: "jason_dev",
      avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop",
      isOnline: false,
    },
    messages: [
      { id: "m1", text: "Did you check the new PR?", senderId: "jason_dev", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24) },
    ],
    unreadCount: 0,
  },
  {
    id: "3",
    user: {
      name: "Neon Dreamer",
      username: "neon_dreamer",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop",
      isOnline: true,
    },
    messages: [
       { id: "m1", text: "Loved your latest post! 🔥", senderId: "neon_dreamer", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2) },
    ],
    unreadCount: 0,
  }
];

// --- Components ---

// Story Viewer Component
interface StoryViewerProps {
  stories: Story[];
  startIndex: number;
  onClose: () => void;
  onDelete?: (id: number) => void;
  onReply?: (username: string, text: string) => void;
}

const StoryViewer: React.FC<StoryViewerProps> = ({ stories, startIndex, onClose, onDelete, onReply }) => {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const controls = useAnimation();
  const baseDuration = 5000; // 5 seconds per photo story
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySent, setReplySent] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [storyLikes, setStoryLikes] = useState<Record<number, boolean>>({});
  const activeStory = stories[currentIndex];
  const storyDuration = activeStory?.videoKey ? Math.min(videoDuration ?? 15000, 60000) : baseDuration;

  useEffect(() => {
    setVideoDuration(null);
    setReplyText("");
  }, [currentIndex]);

  useEffect(() => {
    // Reset progress when index changes
    setProgress(0);
    const intervalTime = 50;
    const step = 100 / (storyDuration / intervalTime);

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (paused) return prev;
        if (prev >= 100) {
          if (currentIndex < stories.length - 1) {
            setCurrentIndex(currentIndex + 1);
            return 0;
          } else {
            onClose();
            return 100;
          }
        }
        return prev + step;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [currentIndex, stories.length, onClose, storyDuration, paused]);

  const handleTap = (e: React.MouseEvent) => {
    const width = window.innerWidth;
    const x = e.clientX;
    
    // Reset timer on manual navigation by setting progress to 0 implicitly via index change
    if (x < width * 0.3) {
      // Previous
      if (currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      }
    } else {
      // Next
      if (currentIndex < stories.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        onClose();
      }
    }
  };

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 100) {
      onClose();
    } else {
      controls.start({ y: 0 });
    }
  };

  useEffect(() => {
    if (stories.length === 0) {
      onClose();
    } else if (currentIndex >= stories.length) {
      setCurrentIndex(stories.length - 1);
    }
  }, [stories.length, currentIndex, onClose]);

  const currentStory = stories[currentIndex];
  if (!currentStory) return null;

  const sendReply = () => {
    const text = replyText.trim();
    if (!text || !onReply) return;
    onReply(currentStory.user, text);
    setReplyText("");
    setReplySent(true);
    setTimeout(() => setReplySent(false), 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
    >
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.7}
        onDragEnd={handleDragEnd}
        animate={controls}
        className="w-full h-full relative"
      >
        {/* Background Blur */}
        <div className="absolute inset-0 z-0">
             <img src={currentStory.img} className="w-full h-full object-cover blur-3xl opacity-50" />
             <div className="absolute inset-0 bg-black/30" />
        </div>

        {/* Main Content */}
        <div className="absolute inset-0 z-10 flex flex-col">
            {/* Progress Bars */}
            <div className="flex space-x-1 p-3 pt-4 z-20">
            {stories.map((story, index) => (
                <div key={story.id} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
                <motion.div 
                    className="h-full bg-white"
                    initial={{ width: index < currentIndex ? "100%" : "0%" }}
                    animate={{ width: index < currentIndex ? "100%" : index === currentIndex ? `${progress}%` : "0%" }}
                    transition={{ ease: "linear", duration: index === currentIndex ? 0.05 : 0.3 }}
                />
                </div>
            ))}
            </div>

            {/* Header */}
            <div className="px-4 py-2 flex items-center justify-between z-20">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full border border-white/50 overflow-hidden">
                        <img src={currentStory.avatar || currentStory.img} className="w-full h-full object-cover" />
                    </div>
                    <div>
                        <p className="text-white font-bold text-sm shadow-black drop-shadow-md">{currentStory.user}</p>
                        <p className="text-white/70 text-xs drop-shadow-md">3h ago</p>
                    </div>
                </div>
                <div className="flex items-center space-x-4">
                    {currentStory.isUser && onDelete && (
                        <button
                            type="button"
                            aria-label="Delete story"
                            onClick={() => {
                                if (window.confirm("Delete this story?")) onDelete(currentStory.id);
                            }}
                        >
                            <Trash2 className="text-white w-6 h-6 drop-shadow-md" strokeWidth={1.5} />
                        </button>
                    )}
                    <button onClick={onClose}>
                        <X className="text-white w-7 h-7 drop-shadow-md" />
                    </button>
                </div>
            </div>

            {/* Story Image */}
            <div className="flex-1 flex items-center justify-center relative overflow-hidden my-2 rounded-xl mx-2" onClick={handleTap}>
                <AnimatePresence mode="wait">
                    {currentStory.videoKey ? (
                        <StoredVideo
                            key={currentStory.id}
                            videoKey={currentStory.videoKey}
                            poster={currentStory.img}
                            autoPlay
                            onLoadedMetadata={(e) => setVideoDuration(Math.round(e.currentTarget.duration * 1000) || null)}
                            className="max-h-full max-w-full rounded-xl object-contain"
                        />
                    ) : (
                        <motion.img
                            key={currentStory.id}
                            src={currentStory.img}
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            transition={{ duration: 0.2 }}
                            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
                            alt="Story"
                        />
                    )}
                </AnimatePresence>
            </div>

            {currentStory.isUser && (
              <div className="px-4 pb-2 z-20">
                <button
                  type="button"
                  onClick={() => setShowViewers((v) => !v)}
                  className="w-full flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-white/80 py-2"
                >
                  <span>Seen by {(currentStory.viewers ?? []).length}</span>
                  <span>{showViewers ? "Hide" : "View"}</span>
                </button>
                {showViewers && (
                  <div className="max-h-40 overflow-y-auto rounded-xl bg-black/60 border border-white/10 p-3">
                    {(currentStory.viewers ?? []).length === 0 ? (
                      <p className="text-sm text-white/60">No views yet.</p>
                    ) : (
                      (currentStory.viewers ?? []).map((v) => (
                        <p key={v} className="text-sm text-white py-1">{v}</p>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Footer Input */}
            <div className="p-4 pb-8 z-20">
                <div className={`flex items-center space-x-3 ${currentStory.isUser ? 'hidden' : ''}`}>
                    <div className="flex-1 h-12 rounded-full border border-white/30 flex items-center px-4 bg-black/20 backdrop-blur-sm">
                        <input
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onFocus={() => setPaused(true)}
                            onBlur={() => setPaused(false)}
                            onKeyDown={(e) => { if (e.key === "Enter") sendReply(); }}
                            placeholder={replySent ? "Sent" : `Reply to ${currentStory.user}...`}
                            className="bg-transparent w-full text-white placeholder-white/70 focus:outline-none text-sm"
                        />
                    </div>
                    <button
                        type="button"
                        aria-label="Like story"
                        onClick={() => setStoryLikes((prev) => ({ ...prev, [currentStory.id]: !prev[currentStory.id] }))}
                        className="w-12 h-12 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                    >
                        <Heart className={`w-7 h-7 ${storyLikes[currentStory.id] ? "text-gold fill-gold" : "text-white"}`} strokeWidth={1.25} />
                    </button>
                    <button
                        type="button"
                        aria-label="Send reply"
                        onClick={sendReply}
                        disabled={!replyText.trim()}
                        className="w-12 h-12 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-40"
                    >
                        <Send className="w-7 h-7 text-white -rotate-12" strokeWidth={1.25} />
                    </button>
                </div>
            </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// 1. Stories Rail with 3D effect
interface StoriesRailProps {
  stories: Story[];
  onAddStory: (img: string, videoFile?: File) => void;
  onStoryClick: (index: number) => void;
}

const StoriesRail: React.FC<StoriesRailProps> = ({ stories, onAddStory, onStoryClick }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (file.type.startsWith("video/")) {
        if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
          alert(`This video is too large. The limit is ${MAX_VIDEO_MB} MB.`);
          return;
        }
        const { poster } = await readVideoPoster(file);
        onAddStory(poster, file);
      } else {
        onAddStory(await readImageAsJpeg(file));
      }
    } catch (err) {
      console.error(err);
      alert("This file can't be opened. Try another one.");
    }
  };

  return (
    <div className="pt-4 pb-4 pl-4 overflow-x-auto scrollbar-none flex space-x-5">
      {/* My Story Add Button */}
      <div 
        className="relative flex-shrink-0 cursor-pointer group flex flex-col items-center"
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="w-16 h-16 rounded-full p-[2px] bg-white/10 flex items-center justify-center transition-all duration-300 group-hover:bg-white/20">
            <div className="w-full h-full rounded-full border border-dashed border-gray-400/50 flex items-center justify-center bg-black/50 relative overflow-hidden group-hover:border-white/50 transition-colors">
                <PlusSquare className="text-gray-300 w-6 h-6 stroke-[1.5] group-hover:text-white transition-colors" />
            </div>
        </div>
        <span className="text-[11px] text-center block mt-2 text-gray-400 font-medium uppercase tracking-widest">Your Story</span>
        <input 
          type="file" 
          ref={fileInputRef} 
          accept="image/*,video/*" 
          className="hidden" 
          onChange={handleFileChange}
        />
      </div>

      {stories.map((story, index) => (
        <motion.div 
            key={story.id} 
            className="flex-shrink-0 cursor-pointer flex flex-col items-center gap-2 group"
            whileTap={{ scale: 0.95 }}
            onClick={() => onStoryClick(index)}
        >
          <div className="relative w-16 h-16 rounded-full overflow-hidden p-[2px] group-hover:scale-105 transition-transform duration-300">
             <div className={`absolute inset-0 rounded-full animate-spin-slow group-hover:blur-[2px] transition-all opacity-80 group-hover:opacity-100 ${story.isUser ? 'bg-white/15' : 'bg-[conic-gradient(from_0deg,#d4b98c,#6b5a3c,#d4b98c)]'}`} style={{ animationDuration: '4s' }}></div>
             <div className="absolute inset-[2px] bg-black rounded-full z-10"></div>
             <img src={story.img} alt={story.user} className="relative z-20 w-full h-full rounded-full object-cover border-[1.5px] border-black" />
          </div>
          <span className="text-[11px] text-gray-300 font-medium tracking-wide truncate max-w-[70px] drop-shadow-sm">{story.user}</span>
        </motion.div>
      ))}
    </div>
  );
};

interface PostCardProps {
  post: Post;
  isSaved: boolean;
  onToggleSave: () => void;
  isOwn: boolean;
  isFollowing: boolean;
  onToggleFollow: () => void;
  onDelete: (id: number) => void;
  onOpenUser: (username: string) => void;
}

const PostCard: React.FC<PostCardProps> = ({ post, isSaved, onToggleSave, isOwn, isFollowing, onToggleFollow, onDelete, onOpenUser }) => {
  const [isLiked, setIsLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [showHeart, setShowHeart] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [shareNote, setShareNote] = useState("");

  const handleShare = async () => {
    const url = window.location.origin;
    const text = post.caption ? `${post.user}: ${post.caption}` : `Post by ${post.user}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "My Social", text, url });
        return;
      }
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShareNote("Link copied");
    } catch (e) {
      setShareNote("Couldn't share");
    }
    setTimeout(() => setShareNote(""), 2000);
  };
  const [comments, setComments] = useState<Comment[]>(post.comments || []);
  const [newComment, setNewComment] = useState("");

  const handleDoubleTap = () => {
    if (!isLiked) {
      setIsLiked(true);
      setLikes(l => l + 1);
    }
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 800);
  };

  const toggleLike = () => {
    if (isLiked) {
      setLikes(l => l - 1);
    } else {
      setLikes(l => l + 1);
    }
    setIsLiked(!isLiked);
  };

  const submitComment = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newComment.trim()) return;
    const comment: Comment = {
      id: Date.now(),
      user: "alex_designs", // Mocked current user
      text: newComment.trim(),
    };
    setComments(prev => [...prev, comment]);
    setNewComment("");
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mb-6 relative bg-[#0a0a0a] border border-white/[0.06] rounded-2xl mx-4 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 top-0 z-10">
        <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gold/70 p-[1px]">
                <img src={post.avatar} className="w-full h-full rounded-full border border-black/50 object-cover" />
            </div>
            <div>
                <button type="button" onClick={() => onOpenUser(post.user)} className="text-[15px] font-bold text-white tracking-tight leading-tight text-left hover:underline underline-offset-4">{post.user}</button>
                {post.location && <p className="text-xs text-gray-400 flex items-center font-medium mt-0.5"><MapPin className="w-3 h-3 mr-1 text-gold" />{post.location}</p>}
            </div>
        </div>
        <div className="flex items-center gap-3">
          {!isOwn && (
            <button
              type="button"
              onClick={onToggleFollow}
              className={`text-[10px] uppercase tracking-[0.16em] px-3 h-7 rounded-full border transition ${
                isFollowing ? "border-white/15 text-zinc-400" : "border-gold/60 text-gold"
              }`}
            >
              {isFollowing ? "Following" : "Follow"}
            </button>
          )}
          {isOwn && (
            <button
              type="button"
              aria-label="Delete post"
              onClick={() => {
                if (window.confirm("Delete this post?")) onDelete(post.id);
              }}
              className="text-zinc-500 hover:text-red-400 transition"
            >
              <Trash2 className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Image Container */}
      <div 
        className="relative w-full aspect-[4/5] bg-black overflow-hidden cursor-pointer shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]"
        onDoubleClick={handleDoubleTap}
      >
        {(post.videoUrl || post.videoKey) ? (
          <StoredVideo videoKey={post.videoKey} videoUrl={post.videoUrl} poster={post.image} className="w-full h-full object-cover" muted loop controls />
        ) : (
          <img src={post.image} className="w-full h-full object-cover" loading="lazy" />
        )}
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none">
        </div>

        {/* Double Tap Heart Animation */}
        <AnimatePresence>
          {showHeart && (
            <motion.div 
              initial={{ scale: 0, opacity: 0, rotate: -15 }}
              animate={{ scale: 1.2, opacity: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0, rotate: 15 }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <Heart className="w-28 h-28 text-gold fill-gold drop-shadow-lg" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-6">
            <motion.button whileTap={{ scale: 0.8 }} onClick={toggleLike} className="group">
                <Heart className={`w-7 h-7 cursor-pointer transition-all duration-300 ease-out group-hover:scale-110 ${isLiked ? 'text-gold fill-gold' : 'text-white hover:text-gold'}`} strokeWidth={1.25} />
            </motion.button>
            <button onClick={() => setShowComments(!showComments)} className="group">
                <MessageCircle className="w-7 h-7 text-white cursor-pointer transition-all duration-300 ease-out group-hover:scale-110 group-hover:text-gold" strokeWidth={1.25} />
            </button>
            <button type="button" aria-label="Share" onClick={handleShare} className="group">
               <Send className="w-7 h-7 text-white -rotate-12 cursor-pointer transition-all duration-300 ease-out group-hover:scale-110 group-hover:text-gold" strokeWidth={1.25} />
            </button>
            {shareNote && <span className="text-[10px] uppercase tracking-[0.16em] text-gold self-center">{shareNote}</span>}
        </div>
        <button onClick={onToggleSave} className="group">
            <Bookmark className={`w-7 h-7 cursor-pointer transition-all duration-300 ease-out group-hover:scale-110 ${isSaved ? 'text-gold fill-gold' : 'text-white hover:text-gold'}`} strokeWidth={1.25} />
        </button>
      </div>

      {/* Caption & Comments */}
      <div className="px-5 pb-5">
        <p className="font-bold text-[15px] mb-2 text-white">{likes.toLocaleString()} likes</p>
        <p className="text-[14.5px] text-gray-200 leading-relaxed font-light">
            <span className="font-bold mr-2 text-white">{post.user}</span>
            {post.caption}
        </p>
        <button 
          onClick={() => setShowComments(!showComments)}
          className="text-gray-500 text-xs mt-3 uppercase tracking-widest cursor-pointer hover:text-gray-300 transition-colors font-medium"
        >
          {comments.length > 0 ? `View all ${comments.length} comments` : "Add a comment..."}
        </button>

        {/* Comments Section */}
        <AnimatePresence>
          {showComments && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 space-y-3 overflow-hidden"
            >
              <div className="max-h-40 overflow-y-auto pr-2 scrollbar-none space-y-3">
                {comments.map(c => (
                  <div key={c.id} className="text-[14px]">
                    <span className="font-bold mr-2 text-white">{c.user}</span>
                    <span className="text-gray-300 font-light">{c.text}</span>
                  </div>
                ))}
              </div>
              <form onSubmit={submitComment} className="flex items-center gap-3 mt-3 pt-3 border-t border-white/10">
                <input 
                  type="text" 
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Leave a thought..." 
                  className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-white/30 transition-colors"
                />
                <button 
                  type="submit" 
                  disabled={!newComment.trim()}
                  className="text-gold font-medium text-sm disabled:opacity-50 cursor-pointer disabled:cursor-default"
                >
                  Post
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// 3. Create Modal with Gemini AI
interface CreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onShare: (image: string, caption: string, videoUrl?: string, videoFile?: File) => void;
}
const CreateModal: React.FC<CreateModalProps> = ({ isOpen, onClose, onShare }) => {
  const [caption, setCaption] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [generatedCaption, setGeneratedCaption] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (file.type.startsWith("video/")) {
        if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
          alert(`This video is too large. The limit is ${MAX_VIDEO_MB} MB.`);
          return;
        }
        const { poster } = await readVideoPoster(file);
        setSelectedVideo(file);
        setSelectedImage(poster);
      } else {
        setSelectedVideo(null);
        setSelectedImage(await readImageAsJpeg(file));
      }
    } catch (err) {
      console.error(err);
      alert("This file can't be opened. Try another one.");
    }
  };

  const handleShare = (e?: React.MouseEvent | React.FormEvent) => {
    if (e) e.preventDefault();
    console.log("Share button triggered", selectedImage, caption);

    if (selectedImage) {
       onShare(selectedImage, caption || "", videoUrl, selectedVideo ?? undefined);
       setVideoUrl("");
       setSelectedVideo(null);
       setCaption("");
       setSelectedImage(null);
       setGeneratedCaption("");
       onClose();
    }
  };

  const generateCaption = async () => {
    if (!caption) return;
    setLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Write a short, viral, witty social media caption for a post about: "${caption}". Include 3 relevant trending hashtags. Return only the caption.`,
      });
      setGeneratedCaption(response.text.trim());
    } catch (error) {
      console.error(error);
      setGeneratedCaption("Error generating caption. Try again!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0, y: "100%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed inset-0 z-50 bg-black flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
             <button onClick={onClose} className="text-white font-medium cursor-pointer hover:text-gray-300 transition-colors">Cancel</button>
             <span className="font-bold text-lg">New Post</span>
             <button 
                onClick={handleShare}
                disabled={!selectedImage}
                className="text-primary font-bold cursor-pointer hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
             >
                Share
             </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-square bg-white/5 rounded-2xl flex items-center justify-center border-2 border-dashed border-white/20 mb-6 relative overflow-hidden group cursor-pointer hover:border-white/40 transition-colors"
            >
                {selectedImage ? (
                    <>
                        <img src={selectedImage} className="w-full h-full object-cover" alt="Preview" />
                        {selectedVideo && (
                          <span className="absolute top-3 right-3 rounded-md bg-black/60 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-white">Reel</span>
                        )}
                    </>
                ) : (
                    <>
                        <div className="absolute inset-0 bg-white/[0.03] group-hover:bg-white/[0.06] transition-colors"></div>
                        <div className="text-center z-10">
                            <Camera className="w-12 h-12 text-white/50 mx-auto mb-2 group-hover:text-white/80 transition-colors" />
                            <p className="text-white/50 text-sm group-hover:text-white/80 transition-colors">Tap to select media</p>
                        </div>
                    </>
                )}
                <input 
                   type="file"
                   accept="image/*,video/*"
                   className="hidden"
                   ref={fileInputRef}
                   onChange={handleFileChange}
                />
            </div>

            {/* AI Section */}
            <div className="bg-surface rounded-xl p-4 border border-glassBorder shadow-2xl">
                <div className="flex items-center space-x-2 mb-3">
                    <Sparkles className="w-5 h-5 text-gold" strokeWidth={1.25} />
                    <h3 className="font-medium tracking-wide text-gold">
                        Caption & AI Magic
                    </h3>
                </div>
                
                <textarea 
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Write a caption or describe your photo for AI..."
                    className="w-full bg-black/40 rounded-lg p-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary mb-3 resize-none h-20"
                />
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="Optional: direct .mp4 link (makes this a Reel)"
                  className="w-full bg-black/40 rounded-lg p-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary mb-3"
                />

                <button 
                    onClick={generateCaption}
                    disabled={loading || !caption}
                    className="w-full py-3 rounded-lg bg-gold text-black font-medium text-sm flex items-center justify-center disabled:opacity-50 cursor-pointer hover:opacity-90 transition-opacity"
                >
                    {loading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <>
                            <Zap className="w-4 h-4 mr-2 fill-white" /> AI: Write for me
                        </>
                    )}
                </button>

                {generatedCaption && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="mt-4 bg-white/5 p-3 rounded-lg border border-white/10"
                    >
                        <p className="text-sm font-medium">{generatedCaption}</p>
                        <div className="flex space-x-4 mt-3">
                            <button 
                              className="text-xs text-primary font-bold uppercase tracking-wider cursor-pointer hover:underline"
                              onClick={() => {
                                  setCaption(generatedCaption);
                                  setGeneratedCaption("");
                              }}
                            >
                                Use this caption
                            </button>
                        </div>
                    </motion.div>
                )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// 4. Edit Profile Modal
interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
}

const EditProfileModal: React.FC<EditProfileModalProps> = ({ isOpen, onClose, profile, onSave }) => {
  const [formData, setFormData] = useState<UserProfile>(profile);
  
  // Reset form data when opening modal with new profile data
  useEffect(() => {
    if (isOpen) {
        setFormData(profile);
    }
  }, [isOpen, profile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              setFormData(prev => ({ ...prev, avatar: reader.result as string }));
          };
          reader.readAsDataURL(file);
      }
  };

  const handleSubmit = () => {
      onSave(formData);
      onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 bg-black flex flex-col"
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/80 backdrop-blur-md">
                <button onClick={onClose} className="text-white">Cancel</button>
                <span className="font-bold text-lg">Edit Profile</span>
                <button onClick={handleSubmit} className="text-primary font-bold">Done</button>
            </div>
            
            <div className="p-6 flex flex-col items-center overflow-y-auto pb-32">
                {/* Avatar */}
                <div className="relative mb-8 group cursor-pointer">
                    <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-white/20">
                        <img src={formData.avatar} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                         <Camera className="w-8 h-8 text-white" />
                    </div>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                    <p className="text-primary text-sm font-medium mt-3 text-center absolute top-full left-0 right-0">Change Profile Photo</p>
                </div>

                {/* Form Fields */}
                <div className="w-full space-y-5 mt-4">
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400 ml-1 font-semibold">Name</label>
                        <input name="name" value={formData.name} onChange={handleChange} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400 ml-1 font-semibold">Username</label>
                        <input name="username" value={formData.username} onChange={handleChange} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400 ml-1 font-semibold">Bio</label>
                        <textarea name="bio" value={formData.bio} onChange={handleChange} rows={3} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all resize-none" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-gray-400 ml-1 font-semibold">Website</label>
                        <input name="website" value={formData.website} onChange={handleChange} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all" />
                    </div>
                </div>
            </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// 5. Chat Components

// Chat Detail View
interface ChatDetailProps {
  conversation: Conversation;
  onBack: () => void;
  onSend: (text: string) => void;
}

const ChatDetail: React.FC<ChatDetailProps> = ({ conversation, onBack, onSend }) => {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation.messages]);

  const handleSend = () => {
    if (inputText.trim()) {
      onSend(inputText);
      setInputText("");
    }
  };

  return (
    <motion.div 
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="fixed inset-0 z-[60] bg-black flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center p-4 border-b border-white/10 bg-black/80 backdrop-blur-md">
        <button onClick={onBack} className="mr-3">
          <ChevronLeft className="w-7 h-7 text-white" />
        </button>
        <div className="relative">
          <div className="w-10 h-10 rounded-full mr-3">
             <img src={conversation.user.avatar} className="w-full h-full rounded-full object-cover" />
          </div>
          {conversation.user.isOnline && (
            <div className="absolute bottom-0 right-3 w-3 h-3 bg-green-500 rounded-full border-2 border-black" />
          )}
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-white">{conversation.user.name}</h3>
          <p className="text-xs text-gray-400">@{conversation.user.username}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background">
        {conversation.messages.map((msg, index) => {
          const isMe = msg.senderId === 'me';
          return (
            <motion.div 
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm ${
                  isMe 
                    ? 'bg-gold text-black rounded-tr-sm' 
                    : 'bg-white/10 text-white rounded-tl-sm'
                }`}
              >
                {msg.text}
              </div>
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-black/90 border-t border-white/10 pb-8">
        <div className="flex items-center bg-white/[0.06] border border-white/[0.08] rounded-full px-4 py-2">
            <input 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Message..."
              className="flex-1 bg-transparent text-white text-sm placeholder-gray-400 focus:outline-none px-2"
            />
            {inputText ? (
              <button onClick={handleSend} className="p-2">
                 <Send className="w-6 h-6 text-primary" />
              </button>
            ) : null}
        </div>
      </div>
    </motion.div>
  );
};

// Inbox List View
interface InboxViewProps {
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
}

const InboxView: React.FC<InboxViewProps> = ({ conversations, onSelectConversation }) => {
  return (
    <div className="pb-32 pt-2">
      <div className="flex items-center justify-between px-4 py-2 mb-4">
        <h1 className="text-2xl font-bold">Messages</h1>
        <PlusSquare className="w-7 h-7 text-white" />
      </div>

      <div className="px-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input 
            placeholder="Search" 
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-white/20"
          />
        </div>
      </div>

      <div className="space-y-1">
        {conversations.map((conv) => (
          <motion.div 
            key={conv.id}
            whileTap={{ backgroundColor: "rgba(255,255,255,0.05)" }}
            onClick={() => onSelectConversation(conv.id)}
            className="flex items-center px-4 py-3 cursor-pointer"
          >
            <div className="relative mr-4">
              <div className="w-14 h-14 rounded-full p-[1px] bg-white/10">
                 <img src={conv.user.avatar} className="w-full h-full rounded-full object-cover" />
              </div>
              {conv.user.isOnline && (
                 <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-black" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
               <div className="flex justify-between items-baseline mb-1">
                 <h3 className="font-semibold text-white truncate">{conv.user.name}</h3>
                 <span className="text-xs text-gray-500">
                    {conv.messages.length > 0 && new Date(conv.messages[conv.messages.length-1].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                 </span>
               </div>
               <div className="flex justify-between items-center">
                 <p className={`text-sm truncate pr-4 ${conv.unreadCount > 0 ? 'text-white font-medium' : 'text-gray-400'}`}>
                    {conv.messages.length > 0 
                       ? `${conv.messages[conv.messages.length-1].senderId === 'me' ? 'You: ' : ''}${conv.messages[conv.messages.length-1].text}`
                       : 'No messages yet'}
                 </p>
                 {conv.unreadCount > 0 && (
                   <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                     <span className="text-[10px] font-bold text-black">{conv.unreadCount}</span>
                   </div>
                 )}
               </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

// 6. Explore View
const EXPLORE_CATEGORIES = ["For you", "Reels", "Tech", "Art", "Style", "Architecture", "Nature", "Sport", "Music", "Food"];

const MOCK_EXPLORE_POSTS: Post[] = [
  { id: 1001, user: "tech_guru", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop", caption: "Future is now", image: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&fit=crop", likes: 2400, liked: false },
  { id: 1002, user: "nature_lover", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop", caption: "Peaceful escapes", image: "https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=600&h=1066&fit=crop", likes: 850, liked: false, isReel: true },
  { id: 1003, user: "urban_architect", avatar: "https://images.unsplash.com/photo-1520023602497-76798a39d846?w=100&h=100&fit=crop", caption: "Concrete jungle", image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&fit=crop", likes: 1200, liked: false },
  { id: 1004, user: "fashion_trends", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop", caption: "New collection dropping soon", image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&h=1066&fit=crop", likes: 5300, liked: false, isReel: true },
  { id: 1005, user: "wanderlust", avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop", caption: "Mountain views", image: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600&fit=crop", likes: 3100, liked: false },
  { id: 1006, user: "foodie_eats", avatar: "https://images.unsplash.com/photo-1526045612212-70caf35c14df?w=100&h=100&fit=crop", caption: "Delicious breakfast", image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=1066&fit=crop", likes: 420, liked: false, isReel: true },
  { id: 1007, user: "sport_live", avatar: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=100&h=100&fit=crop", caption: "Pushing the limits", image: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=600&fit=crop", likes: 8900, liked: false },
  { id: 1008, user: "minimal_design", avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop", caption: "Less is more", image: "https://images.unsplash.com/photo-1490138139357-fc819d02e344?w=600&h=1066&fit=crop", likes: 1100, liked: false, isReel: true },
  { id: 1009, user: "cars_daily", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop", caption: "Classic beauty", image: "https://images.unsplash.com/photo-1503376712341-ea1cd84e597c?w=600&fit=crop", likes: 6700, liked: false },
  { id: 1010, user: "art_gallery", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop", caption: "Abstract thoughts", image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&h=1066&fit=crop", likes: 2300, liked: false, isReel: true },
  { id: 1011, user: "interior_decors", avatar: "https://images.unsplash.com/photo-1520023602497-76798a39d846?w=100&h=100&fit=crop", caption: "Cozy spaces", image: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=600&fit=crop", likes: 3400, liked: false },
  { id: 1012, user: "fitness_journey", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop", caption: "Morning grind", image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&h=1066&fit=crop", likes: 5600, liked: false, isReel: true },
  { id: 1013, user: "music_vibes", avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop", caption: "Live concert", image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&fit=crop", likes: 8800, liked: false },
  { id: 1014, user: "tech_setup", avatar: "https://images.unsplash.com/photo-1526045612212-70caf35c14df?w=100&h=100&fit=crop", caption: "Workspace goals", image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&h=1066&fit=crop", likes: 4500, liked: false, isReel: true },
  { id: 1015, user: "coffee_time", avatar: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=100&h=100&fit=crop", caption: "Morning brew", image: "https://images.unsplash.com/photo-1497935586351-b67a49e012bf?w=600&fit=crop", likes: 1800, liked: false },
];

const formatCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

const TOPIC_RULES: { topic: string; pattern: RegExp }[] = [
  { topic: "Tech", pattern: /tech|future|workspace|setup|code|digital|cyber|guru/i },
  { topic: "Art", pattern: /art|abstract|gallery|paint|creative|thought/i },
  { topic: "Architecture", pattern: /urban|architect|concrete|interior|cozy|geometry|space|decor/i },
  { topic: "Style", pattern: /fashion|style|minimal|collection|outfit|design/i },
  { topic: "Nature", pattern: /nature|mountain|alps|forest|peaceful|escape|wild|breathe|wander/i },
  { topic: "Sport", pattern: /fitness|sport|grind|limits|push/i },
  { topic: "Music", pattern: /music|concert|live|vibe/i },
  { topic: "Food", pattern: /food|coffee|breakfast|brew|delicious|eat/i },
];

const topicOf = (post: Post): string => {
  const text = `${post.caption} ${post.user}`;
  const match = TOPIC_RULES.find((rule) => rule.pattern.test(text));
  return match ? match.topic : "Lifestyle";
};

interface ExploreState {
  interests: Record<string, number>;
  seen: number[];
  hidden: number[];
  likes: Record<number, boolean>;
}

const EXPLORE_KEY = "aura_explore_v1";

const loadExploreState = (): ExploreState => {
  try {
    const raw = localStorage.getItem(EXPLORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        interests: parsed.interests ?? {},
        seen: Array.isArray(parsed.seen) ? parsed.seen : [],
        hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
        likes: parsed.likes ?? {},
      };
    }
  } catch (e) {
    console.error("Failed to read explore state", e);
  }
  return { interests: {}, seen: [], hidden: [], likes: {} };
};

const saveExploreState = (state: ExploreState) => {
  try {
    localStorage.setItem(EXPLORE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save explore state", e);
  }
};

const bumpInterest = (interests: Record<string, number>, topic: string, delta: number) => ({
  ...interests,
  [topic]: (interests[topic] ?? 0) + delta,
});


// Ranks posts by learned interests, likes and a per-session jitter.
// Posts shown in earlier visits (penalty list) drop down so the feed rotates.
const rankPosts = (
  posts: Post[],
  state: ExploreState,
  previouslySeen: number[],
  jitter: Record<number, number>
): Post[] =>
  posts
    .filter((p) => !state.hidden.includes(p.id))
    .map((p) => {
      const interest = state.interests[topicOf(p)] ?? 0;
      const liked = state.likes[p.id] ?? p.liked;
      const score =
        interest * 2 +
        (liked ? 2 : 0) -
        (previouslySeen.includes(p.id) ? 6 : 0) +
        (jitter[p.id] ?? 0);
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);

const ExploreView: React.FC<{
  savedPostIds: number[];
  onToggleSave: (postId: number) => void;
  following: string[];
  onToggleFollow: (username: string) => void;
  currentUsername: string;
  onDeletePost: (id: number) => void;
  onOpenUser: (username: string) => void;
}> = ({ savedPostIds, onToggleSave, following, onToggleFollow, currentUsername, onDeletePost, onOpenUser }) => {
  const [state, setState] = useState<ExploreState>(() => loadExploreState());
  // Snapshot of what was seen in earlier visits, used for rotation this session.
  const previouslySeen = useRef<number[]>(state.seen);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [jitter, setJitter] = useState<Record<number, number>>({});
  const [activeCategory, setActiveCategory] = useState("For you");
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionComments, setSessionComments] = useState<Record<number, Comment[]>>({});
  const [draftComment, setDraftComment] = useState("");

  const update = (fn: (prev: ExploreState) => ExploreState) =>
    setState((prev) => {
      const next = fn(prev);
      saveExploreState(next);
      return next;
    });

  useEffect(() => {
    let loaded: Post[] = [];
    const stored = localStorage.getItem("aura_posts_v2");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) loaded = parsed.filter((p: Post) => p.image);
      } catch (e) {
        console.error("Failed to load posts in Explore", e);
      }
    }

    // Remove duplicates by id and by image so the same clip never repeats.
    const ids = new Set<number>();
    const images = new Set<string>();
    const unique = [...loaded, ...MOCK_EXPLORE_POSTS].filter((p) => {
      if (ids.has(p.id) || images.has(p.image)) return false;
      ids.add(p.id);
      images.add(p.image);
      return true;
    });

    const nextJitter = Object.fromEntries(unique.map((p) => [p.id, Math.random() * 3]));
    setAllPosts(unique);
    setJitter(nextJitter);

    const shownNow = rankPosts(unique, state, previouslySeen.current, nextJitter)
      .slice(0, 12)
      .map((p) => p.id);
    update((prev) => ({ ...prev, seen: [...prev.seen, ...shownNow].slice(-80) }));

    const timer = setTimeout(() => setIsLoading(false), 450);
    return () => clearTimeout(timer);
  }, []);

  const ranked = rankPosts(allPosts, state, previouslySeen.current, jitter);
  const normalizedQuery = query.trim().toLowerCase();

  const visiblePosts = ranked.filter((post) => {
    if (activeCategory === "Reels" && !post.isReel) return false;
    if (activeCategory !== "For you" && activeCategory !== "Reels" && topicOf(post) !== activeCategory) return false;
    if (normalizedQuery) {
      const haystack = `${post.caption} ${post.user}`.toLowerCase();
      if (!haystack.includes(normalizedQuery)) return false;
    }
    return true;
  });

  const isLiked = (post: Post) => state.likes[post.id] ?? post.liked;
  const likeCount = (post: Post) => {
    const delta = isLiked(post) === post.liked ? 0 : isLiked(post) ? 1 : -1;
    return post.likes + delta;
  };

  const toggleLike = (post: Post) => {
    const nextLiked = !isLiked(post);
    update((prev) => ({
      ...prev,
      likes: { ...prev.likes, [post.id]: nextLiked },
      interests: bumpInterest(prev.interests, topicOf(post), nextLiked ? 3 : -3),
    }));
  };

  const openPost = (post: Post) => {
    setSelectedPost(post);
    setMenuOpen(false);
    setDraftComment("");
    update((prev) => ({ ...prev, interests: bumpInterest(prev.interests, topicOf(post), 1) }));
  };

  const toggleSave = (post: Post) => {
    const wasSaved = savedPostIds.includes(post.id);
    onToggleSave(post.id);
    update((prev) => ({
      ...prev,
      interests: bumpInterest(prev.interests, topicOf(post), wasSaved ? -4 : 4),
    }));
  };

  const markNotInterested = (post: Post) => {
    update((prev) => ({
      ...prev,
      hidden: [...prev.hidden.filter((id) => id !== post.id), post.id].slice(-200),
      interests: bumpInterest(prev.interests, topicOf(post), -3),
    }));
    setSelectedPost(null);
    setMenuOpen(false);
  };

  const pickCategory = (category: string) => {
    setActiveCategory(category);
    if (category !== "For you" && category !== "Reels") {
      update((prev) => ({ ...prev, interests: bumpInterest(prev.interests, category, 1) }));
    }
  };

  const submitComment = () => {
    if (!selectedPost || !draftComment.trim()) return;
    const comment: Comment = { id: Date.now(), user: "alex_designs", text: draftComment.trim() };
    setSessionComments((prev) => ({
      ...prev,
      [selectedPost.id]: [...(prev[selectedPost.id] ?? []), comment],
    }));
    setDraftComment("");
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto pb-36">
      <header className="sticky top-0 z-20 bg-black/70 backdrop-blur-xl border-b border-white/[0.06] px-4 pt-5 pb-3">
        <div className="flex items-end justify-between mb-4">
          <h2 className="font-display text-3xl font-medium tracking-wide text-white">Explore</h2>
          <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 tabular-nums">
            {isLoading ? "" : `${visiblePosts.length} posts`}
          </span>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
            strokeWidth={1.25}
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search captions or creators"
            aria-label="Search captions or creators"
            className="w-full h-11 rounded-full bg-white/[0.04] border border-white/[0.08] pl-10 pr-10 text-[13px] tracking-wide placeholder:text-zinc-600 focus:outline-none focus:border-gold/50 focus:bg-white/[0.06] transition"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-4 h-4" strokeWidth={1.25} />
            </button>
          )}
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
          {EXPLORE_CATEGORIES.map((category) => {
            const isActive = activeCategory === category;
            return (
              <button
                key={category}
                type="button"
                aria-pressed={isActive}
                onClick={() => pickCategory(category)}
                className={`shrink-0 h-8 px-4 rounded-full text-[11px] uppercase tracking-[0.16em] font-medium transition-colors ${
                  isActive
                    ? "bg-gold text-black"
                    : "border border-white/[0.08] text-zinc-400 hover:text-white hover:border-white/20"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>
      </header>

      <div className="px-1 pt-1">
        {isLoading ? (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1 md:gap-2">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-lg bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : visiblePosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-24 px-6">
            <p className="font-display text-2xl">Nothing here yet</p>
            <p className="text-sm text-zinc-500 mt-2">
              {normalizedQuery ? `No results for "${query.trim()}".` : "Try another category."}
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setActiveCategory("For you");
              }}
              className="mt-5 h-9 px-4 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-sm transition"
            >
              Reset
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1 md:gap-2">
            {visiblePosts.map((post, idx) => (
              <motion.button
                key={post.id}
                type="button"
                onClick={() => openPost(post)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: Math.min(idx * 0.02, 0.3) }}
                aria-label={`Open post by ${post.user}`}
                className={`group relative overflow-hidden bg-zinc-950 ring-1 ring-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                  post.isReel ? "aspect-[9/16] rounded-xl" : "aspect-square rounded-lg"
                }`}
              >
                <img
                  src={post.image}
                  alt={post.caption}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
                {post.isReel && (
                  <span className="absolute top-2 right-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.15em] text-white">
                    Reel
                  </span>
                )}
                {isLiked(post) && (
                  <Heart
                    className="absolute bottom-2 left-2 w-3.5 h-3.5 text-gold fill-gold"
                    strokeWidth={1.25}
                    aria-label="Liked"
                  />
                )}
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* Post detail */}
      <AnimatePresence>
        {selectedPost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6"
            role="dialog"
            aria-modal="true"
          >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedPost(null)} />

            <motion.div
              initial={{ scale: 0.97, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0, y: 16 }}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 w-full max-w-4xl bg-[#0c0c0c] rounded-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh] border border-white/[0.08]"
            >
              <div className="md:flex-1 bg-black flex items-center justify-center min-h-[280px]">
                {(selectedPost.videoUrl || selectedPost.videoKey) ? (
                  <StoredVideo videoKey={selectedPost.videoKey} videoUrl={selectedPost.videoUrl} poster={selectedPost.image} className="max-h-[90vh] w-full object-contain" controls />
                ) : (
                  <img src={selectedPost.image} alt={selectedPost.caption} className="max-h-[90vh] w-full object-contain" />
                )}
              </div>

              <div className="w-full md:w-[38%] flex flex-col max-h-[90vh] md:max-h-none">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                  <div className="flex items-center gap-3 min-w-0">
                    <img src={selectedPost.avatar} alt="" className="w-9 h-9 rounded-full object-cover ring-1 ring-white/10" />
                    <button type="button" onClick={() => { const u = selectedPost.user; setSelectedPost(null); onOpenUser(u); }} className="text-sm font-medium truncate hover:underline underline-offset-4">{selectedPost.user}</button>
                    {selectedPost.user !== currentUsername && (
                      <button
                        type="button"
                        onClick={() => onToggleFollow(selectedPost.user)}
                        className={`ml-2 text-[10px] uppercase tracking-[0.16em] px-3 h-6 rounded-full border transition ${
                          following.includes(selectedPost.user) ? "border-white/15 text-zinc-400" : "border-gold/60 text-gold"
                        }`}
                      >
                        {following.includes(selectedPost.user) ? "Following" : "Follow"}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {selectedPost.user === currentUsername && (
                      <button
                        type="button"
                        aria-label="Delete post"
                        onClick={() => {
                          if (window.confirm("Delete this post?")) {
                            onDeletePost(selectedPost.id);
                            setSelectedPost(null);
                          }
                        }}
                        className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-white/10 transition"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                    )}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMenuOpen((v) => !v)}
                        aria-label="More options"
                        aria-expanded={menuOpen}
                        className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
                      >
                        <MoreHorizontal className="w-5 h-5" strokeWidth={1.25} />
                      </button>
                      {menuOpen && (
                        <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-white/[0.08] bg-[#141414] p-1 shadow-2xl z-20">
                          <button
                            type="button"
                            onClick={() => markNotInterested(selectedPost)}
                            className="w-full text-left px-3 py-2 rounded-lg text-sm text-zinc-200 hover:bg-white/[0.06]"
                          >
                            Not interested
                          </button>
                          <p className="px-3 pb-2 pt-1 text-[11px] text-zinc-500">
                            Hides this post and shows fewer like it.
                          </p>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPost(null)}
                      aria-label="Close"
                      className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
                    >
                      <X className="w-5 h-5" strokeWidth={1.25} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 no-scrollbar">
                  <p className="text-sm text-zinc-200 leading-relaxed">
                    <span className="font-medium text-white mr-2">{selectedPost.user}</span>
                    {selectedPost.caption}
                  </p>

                  <div className="space-y-4">
                    {[...(selectedPost.comments ?? []), ...(sessionComments[selectedPost.id] ?? [])].length === 0 ? (
                      <p className="text-sm text-zinc-500">No comments yet.</p>
                    ) : (
                      [...(selectedPost.comments ?? []), ...(sessionComments[selectedPost.id] ?? [])].map((c) => (
                        <p key={c.id} className="text-sm text-zinc-300">
                          <span className="font-medium text-white mr-2">{c.user}</span>
                          {c.text}
                        </p>
                      ))
                    )}
                  </div>
                </div>

                <div className="px-5 py-4 border-t border-white/[0.06] space-y-3">
                  <div className="flex items-center gap-5">
                    <button
                      type="button"
                      onClick={() => toggleLike(selectedPost)}
                      aria-label={isLiked(selectedPost) ? "Unlike" : "Like"}
                      aria-pressed={isLiked(selectedPost)}
                      className="transition-transform active:scale-90"
                    >
                      <Heart
                        className={`w-6 h-6 transition-colors ${isLiked(selectedPost) ? "text-gold fill-gold" : "text-white"}`}
                        strokeWidth={1.25}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSave(selectedPost)}
                      aria-label={savedPostIds.includes(selectedPost.id) ? "Remove from saved" : "Save"}
                      aria-pressed={savedPostIds.includes(selectedPost.id)}
                      className="ml-auto transition-transform active:scale-90"
                    >
                      <Bookmark
                        className={`w-6 h-6 transition-colors ${
                          savedPostIds.includes(selectedPost.id) ? "text-gold fill-gold" : "text-white"
                        }`}
                        strokeWidth={1.25}
                      />
                    </button>
                  </div>
                  <p className="text-sm font-medium">{formatCount(likeCount(selectedPost))} likes</p>

                  <form
                    className="flex items-center gap-3 pt-3 border-t border-white/[0.06]"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitComment();
                    }}
                  >
                    <input
                      value={draftComment}
                      onChange={(e) => setDraftComment(e.target.value)}
                      placeholder="Add a comment"
                      aria-label="Add a comment"
                      className="flex-1 bg-transparent text-sm placeholder:text-zinc-600 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!draftComment.trim()}
                      className="text-sm text-gold font-medium disabled:opacity-30 transition"
                    >
                      Post
                    </button>
                  </form>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// 7. Navigation Bar (bottom, minimal)
interface NavBarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenCreate: () => void;
}

const NAV_ITEMS: { key: string; label: string; icon: React.ElementType }[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "search", label: "Explore", icon: Search },
  { key: "create", label: "Create", icon: PlusSquare },
  { key: "inbox", label: "Messages", icon: MessageCircle },
  { key: "profile", label: "Profile", icon: User },
  { key: "settings", label: "Settings", icon: Settings },
];

const NavBar: React.FC<NavBarProps> = ({ activeTab, setActiveTab, onOpenCreate }) => {
  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-black/70 backdrop-blur-2xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-between px-2">
        {NAV_ITEMS.map((item) => {
          if (item.key === "create") {
            return (
              <li key={item.key} className="flex flex-1 items-center justify-center">
                <button
                  type="button"
                  onClick={onOpenCreate}
                  aria-label="Create post"
                  className="flex h-10 w-12 items-center justify-center rounded-xl bg-gold text-black shadow-[0_0_0_1px_rgba(212,185,140,0.35)] transition-transform hover:scale-105 active:scale-95"
                >
                  <PlusSquare className="h-5 w-5" strokeWidth={1.5} />
                </button>
              </li>
            );
          }

          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <li key={item.key} className="flex flex-1">
              <button
                type="button"
                onClick={() => setActiveTab(item.key)}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex h-16 w-full items-center justify-center transition-colors ${
                  isActive ? "text-gold" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute bottom-2.5 h-1 w-1 rounded-full bg-gold"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 1.75 : 1.25} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};


// 7. Views
interface HomeViewProps {
  stories: Story[];
  onAddStory: (img: string, videoFile?: File) => void;
  posts: Post[];
  savedPostIds: number[];
  onToggleSave: (id: number) => void;
  following: string[];
  onToggleFollow: (username: string) => void;
  currentUsername: string;
  onDeletePost: (id: number) => void;
  onDeleteStory: (id: number) => void;
  onOpenUser: (username: string) => void;
  onStoryReply: (username: string, text: string) => void;
}

const HomeView: React.FC<HomeViewProps> = ({ stories, onAddStory, posts, savedPostIds, onToggleSave, following, onToggleFollow, currentUsername, onDeletePost, onDeleteStory, onOpenUser, onStoryReply }) => {
    const [viewingStoryIndex, setViewingStoryIndex] = useState<number | null>(null);

    return (
        <div className="pb-32 pt-2">
            <div className="flex items-center justify-between px-4 py-2 mb-2">
                <h1 className="font-script text-[24px] font-normal text-white leading-none">{APP_NAME}</h1>
            </div>
            
            <StoriesRail 
                stories={stories} 
                onAddStory={onAddStory}
                onStoryClick={(index) => setViewingStoryIndex(index)}
            />
            
            <div className="h-[1px] bg-white/10 my-2 mx-4" />
            
            <div className="mt-4">
                {posts.map(post => (
                    <PostCard 
                        key={post.id} 
                        post={post} 
                        isSaved={savedPostIds.includes(post.id)}
                        onToggleSave={() => onToggleSave(post.id)}
                        isOwn={post.user === currentUsername}
                        isFollowing={following.includes(post.user)}
                        onToggleFollow={() => onToggleFollow(post.user)}
                        onDelete={onDeletePost}
                        onOpenUser={onOpenUser}
                    />
                ))}
            </div>

            <AnimatePresence>
                {viewingStoryIndex !== null && (
                    <StoryViewer 
                        stories={stories} 
                        startIndex={viewingStoryIndex} 
                        onClose={() => setViewingStoryIndex(null)}
                        onDelete={onDeleteStory}
                        onReply={onStoryReply} 
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

interface ProfileViewProps {
    profile: UserProfile;
    onEditProfile: () => void;
    posts?: Post[];
    onCreatePost?: () => void;
    following?: string[];
}

const ProfileView: React.FC<ProfileViewProps> = ({ profile, onEditProfile, posts, onCreatePost, following }) => {
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");
  const myPosts = (posts ?? []).filter((p) => p.user === profile.username && p.image);

  const handleShare = async () => {
    const link = `https://${profile.website || "mysocial.app"}`;
    try {
      await navigator.clipboard.writeText(link);
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
    } catch (e) {
      console.error("Clipboard unavailable", e);
    }
  };

  return (
    <div className="pb-36 max-w-3xl mx-auto">
      <div className="px-6 pt-10">
        <div className="flex items-center gap-6 md:gap-10">
          <img
            src={profile.avatar}
            alt={profile.name}
            className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover ring-1 ring-gold/40 p-0.5"
          />
          <div className="flex-1 grid grid-cols-3 gap-2 text-center">
            <div>
              <span className="block font-display text-2xl">{myPosts.length}</span>
              <span className="block text-[9px] uppercase tracking-[0.1em] text-zinc-500 whitespace-nowrap">Posts</span>
            </div>
            <div>
              <span className="block font-display text-2xl">{profile.stats.followers}</span>
              <span className="block text-[9px] uppercase tracking-[0.1em] text-zinc-500 whitespace-nowrap">Followers</span>
            </div>
            <div>
              <span className="block font-display text-2xl">{(following ?? []).length}</span>
              <span className="block text-[9px] uppercase tracking-[0.1em] text-zinc-500 whitespace-nowrap">Following</span>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h2 className="font-display text-2xl tracking-wide">{profile.name}</h2>
          <p className="text-zinc-400 text-sm whitespace-pre-wrap mt-1 leading-relaxed">{profile.bio}</p>
          {profile.website && (
            <a
              href={`https://${profile.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold text-sm mt-2 inline-block hover:underline underline-offset-4"
            >
              {profile.website}
            </a>
          )}
        </div>

        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onEditProfile}
            className="flex-1 h-10 rounded-xl bg-white text-black text-[12px] uppercase tracking-[0.16em] font-medium hover:bg-zinc-200 transition"
          >
            Edit profile
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="flex-1 h-10 rounded-xl border border-white/[0.1] text-[12px] uppercase tracking-[0.16em] font-medium hover:border-white/25 transition"
          >
            {shareStatus === "copied" ? "Link copied" : "Share profile"}
          </button>
        </div>
      </div>

      <div className="mt-10 border-t border-white/[0.06]">
        {myPosts.length === 0 ? (
          <div className="flex flex-col items-center text-center py-20 px-6">
            <p className="font-display text-2xl">No posts yet</p>
            <p className="text-sm text-zinc-500 mt-2">Share your first piece of work.</p>
            <button
              type="button"
              onClick={onCreatePost}
              className="mt-5 h-9 px-5 rounded-full bg-gold text-black text-[11px] uppercase tracking-[0.16em] font-medium"
            >
              Create post
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1 mt-1">
            {myPosts.map((post) => (
              <div key={post.id} className="aspect-square overflow-hidden bg-zinc-950">
                <img src={post.image} alt={post.caption} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface UserProfileModalProps {
  username: string;
  posts: Post[];
  following: string[];
  currentUsername: string;
  onToggleFollow: (username: string) => void;
  onMessage: (username: string) => void;
  onClose: () => void;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  username,
  posts,
  following,
  currentUsername,
  onToggleFollow,
  onMessage,
  onClose,
}) => {
  const userPosts = posts.filter((p) => p.user === username && p.image);
  const author = posts.find((p) => p.user === username);
  const isOwn = username === currentUsername;
  const isFollowing = following.includes(username);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full sm:max-w-md max-h-[88vh] overflow-y-auto bg-[#0c0c0c] rounded-t-3xl sm:rounded-2xl border border-white/[0.08]"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/[0.06]">
          <span className="text-sm font-medium truncate">{username}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" strokeWidth={1.25} />
          </button>
        </div>

        <div className="px-5 pt-5 pb-6">
          <div className="flex items-center gap-5">
            {author?.avatar ? (
              <img src={author.avatar} alt={username} className="w-20 h-20 rounded-full object-cover ring-1 ring-gold/40 p-0.5" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-zinc-900" />
            )}
            <div>
              <span className="block font-display text-2xl">{userPosts.length}</span>
              <span className="block text-[9px] uppercase tracking-[0.1em] text-zinc-500 whitespace-nowrap">Posts</span>
            </div>
          </div>

          <h2 className="font-display text-xl tracking-wide mt-4">{username}</h2>

          {isOwn ? (
            <p className="mt-4 text-sm text-zinc-500">This is your profile.</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onToggleFollow(username)}
                aria-pressed={isFollowing}
                className={`h-10 rounded-xl text-[12px] uppercase tracking-[0.16em] font-medium transition ${
                  isFollowing
                    ? "border border-white/[0.12] text-zinc-300 hover:border-white/25"
                    : "bg-gold text-black"
                }`}
              >
                {isFollowing ? "Following" : "Follow"}
              </button>
              <button
                type="button"
                onClick={() => onMessage(username)}
                className="h-10 rounded-xl border border-white/[0.12] text-[12px] uppercase tracking-[0.16em] font-medium text-white hover:border-white/25 transition"
              >
                Message
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-white/[0.06]">
          {userPosts.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-12">No posts yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1 p-1">
              {userPosts.map((post) => (
                <div key={post.id} className="aspect-square overflow-hidden bg-zinc-950">
                  {(post.videoUrl || post.videoKey) ? (
                    <StoredVideo videoKey={post.videoKey} videoUrl={post.videoUrl} poster={post.image} muted className="w-full h-full object-cover" />
                  ) : (
                    <img src={post.image} alt={post.caption} loading="lazy" className="w-full h-full object-cover" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

interface ComingSoonProps {
    title: string;
    icon: React.ElementType;
}
const ComingSoon: React.FC<ComingSoonProps> = ({ title, icon: Icon }) => (
    <div className="h-screen flex flex-col items-center justify-center p-8 text-center pb-32">
        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6 animate-pulse-slow">
            <Icon className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">{title}</h2>
        <p className="text-gray-400">This next-gen feature is currently being compiled by our neural networks.</p>
    </div>
);

// --- Main App Component ---
const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState("home");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem('aura_user_profile');
      return saved ? { ...INITIAL_PROFILE, ...JSON.parse(saved) } : INITIAL_PROFILE;
    } catch (e) {
      return INITIAL_PROFILE;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('aura_user_profile', JSON.stringify(userProfile));
    } catch (e) {
      console.error("Failed to save profile", e);
    }
  }, [userProfile]);
  const [stories, setStories] = useState<Story[]>(() => {
    try {
      const saved: Story[] = JSON.parse(localStorage.getItem('mysocial_user_stories') || '[]');
      const fresh = saved.filter(st => st.createdAt && Date.now() - st.createdAt < 24 * 60 * 60 * 1000);
      return [...fresh, ...INITIAL_STORIES];
    } catch (e) {
      return INITIAL_STORIES;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('mysocial_user_stories', JSON.stringify(stories.filter(st => st.isUser && st.createdAt)));
    } catch (e) {
      console.error("Failed to save stories", e);
    }
  }, [stories]);
  const [posts, setPosts] = useState<Post[]>(() => {
    const saved = localStorage.getItem('aura_posts_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Filter out black/invalid posts
          const validPosts = parsed.filter(p => p && p.image && typeof p.image === 'string' && p.image.trim() !== '');
          if (validPosts.length > 0) {
            return validPosts;
          }
        }
      } catch (e) {
        console.error("Failed to load posts", e);
      }
    }
    return INITIAL_POSTS;
  });

  const [savedPostIds, setSavedPostIds] = useState<number[]>(() => {
    const saved = localStorage.getItem('savedPostIds');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to load saved posts", e);
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('aura_posts_v2', JSON.stringify(posts));
  }, [posts]);

  useEffect(() => {
    localStorage.setItem('savedPostIds', JSON.stringify(savedPostIds));
  }, [savedPostIds]);

  const handleToggleSave = (postId: number) => {
    setSavedPostIds(prev => 
      prev.includes(postId) 
        ? prev.filter(id => id !== postId) 
        : [...prev, postId]
    );
  };
  
  const [following, setFollowing] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('aura_following') || '[]');
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('aura_following', JSON.stringify(following));
  }, [following]);

  const handleToggleFollow = (username: string) => {
    setFollowing(prev => (prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]));
  };

  const handleDeletePost = (postId: number) => {
    const doomed = posts.find(p => p.id === postId);
    if (doomed?.videoKey) deleteMedia(doomed.videoKey).catch(() => {});
    setPosts(prev => prev.filter(p => p.id !== postId));
    setSavedPostIds(prev => prev.filter(id => id !== postId));
  };

  const handleDeleteStory = (storyId: number) => {
    const doomed = stories.find(st => st.id === storyId);
    if (doomed?.videoKey) deleteMedia(doomed.videoKey).catch(() => {});
    setStories(prev => prev.filter(s => s.id !== storyId));
  };

  const [viewingUser, setViewingUser] = useState<string | null>(null);

  // Messaging State
  const [conversations, setConversations] = useState<Conversation[]>(INITIAL_CONVERSATIONS);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const handleUpdateProfile = (updatedProfile: UserProfile) => {
    setUserProfile(updatedProfile);
  };

  const handleAddStory = async (img: string, videoFile?: File) => {
    const id = Date.now();
    let videoKey: string | undefined;
    if (videoFile) {
      try {
        videoKey = `story-${id}`;
        await saveMedia(videoKey, videoFile);
      } catch (e) {
        console.error(e);
        alert("Couldn't save this video on your device. Try a shorter one.");
        return;
      }
    }
    const newStory: Story = {
      id,
      user: 'You',
      img: img,
      isUser: true,
      avatar: userProfile.avatar,
      videoKey,
      createdAt: id,
      viewers: [],
    };
    setStories(prev => [newStory, ...prev]);
  };

  const handleStoryReply = (username: string, text: string) => {
    setConversations(prev => {
      const message = { id: Date.now().toString(), text, senderId: 'me', timestamp: new Date() };
      const exists = prev.some(c => c.user.username === username);
      if (exists) {
        return prev.map(c => (c.user.username === username ? { ...c, messages: [...c.messages, message] } : c));
      }
      const story = stories.find(st => st.user === username);
      return [
        {
          id: `conv-${username}`,
          user: { name: username, username, avatar: story?.avatar || story?.img || '', isOnline: false },
          messages: [message],
          unreadCount: 0,
        },
        ...prev,
      ];
    });
  };

  const handleCreatePost = async (image: string, caption: string, videoUrl?: string, videoFile?: File) => {
    if (!image || image.trim() === '') return;
    const id = Date.now();
    let videoKey: string | undefined;
    if (videoFile) {
      try {
        videoKey = `post-${id}`;
        await saveMedia(videoKey, videoFile);
      } catch (e) {
        console.error(e);
        alert("Couldn't save this video on your device. Try a shorter one.");
        return;
      }
    }
    const newPost: Post = {
      id,
      user: userProfile.username, // Local user
      avatar: userProfile.avatar,
      image: image,
      likes: 0,
      caption: caption,
      liked: false,
      comments: [],
      videoUrl: videoFile ? undefined : (videoUrl?.trim() || undefined),
      videoKey,
      isReel: !!(videoFile || videoUrl?.trim()),
    };
    
    setPosts(prev => {
      const updatedPosts = [newPost, ...prev];
      localStorage.setItem('aura_posts_v2', JSON.stringify(updatedPosts));
      return updatedPosts;
    });
    
    setIsCreateOpen(false);
  };

  const handleOpenChat = (username: string) => {
    const existing = conversations.find(c => c.user.username === username);
    let id: string;
    if (existing) {
      id = existing.id;
    } else {
      id = `conv-${username}`;
      const avatar =
        posts.find(p => p.user === username)?.avatar ||
        stories.find(st => st.user === username)?.avatar ||
        '';
      setConversations(prev => [
        { id, user: { name: username, username, avatar, isOnline: false }, messages: [], unreadCount: 0 },
        ...prev,
      ]);
    }
    setViewingUser(null);
    setActiveTab('inbox');
    setActiveConversationId(id);
  };

  const handleSendMessage = (text: string) => {
    if (!activeConversationId) return;
    
    setConversations(prev => prev.map(conv => {
      if (conv.id === activeConversationId) {
        return {
          ...conv,
          messages: [
            ...conv.messages,
            {
              id: Date.now().toString(),
              text,
              senderId: 'me',
              timestamp: new Date()
            }
          ]
        };
      }
      return conv;
    }));
  };

  // Render content based on tab
  const renderContent = () => {
    switch(activeTab) {
        case 'home': return <HomeView stories={stories} onAddStory={handleAddStory} posts={posts} savedPostIds={savedPostIds} onToggleSave={handleToggleSave} following={following} onToggleFollow={handleToggleFollow} currentUsername={userProfile.username} onDeletePost={handleDeletePost} onDeleteStory={handleDeleteStory} onOpenUser={setViewingUser} onStoryReply={handleStoryReply} />;
        case 'search': return <ExploreView savedPostIds={savedPostIds} onToggleSave={handleToggleSave} following={following} onToggleFollow={handleToggleFollow} currentUsername={userProfile.username} onDeletePost={handleDeletePost} onOpenUser={setViewingUser} />;
        case 'inbox': return (
           <InboxView 
             conversations={conversations} 
             onSelectConversation={setActiveConversationId} 
           />
        );
        case 'profile': return (
            <ProfileView 
                profile={userProfile} 
                onEditProfile={() => setIsEditProfileOpen(true)}
                posts={posts}
                onCreatePost={() => setIsCreateOpen(true)}
                following={following} 
            />
        );
        case 'settings': return <SettingsDashboard />;
        default: return <HomeView stories={stories} onAddStory={handleAddStory} posts={posts} savedPostIds={savedPostIds} onToggleSave={handleToggleSave} following={following} onToggleFollow={handleToggleFollow} currentUsername={userProfile.username} onDeletePost={handleDeletePost} onDeleteStory={handleDeleteStory} onOpenUser={setViewingUser} onStoryReply={handleStoryReply} />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-white font-sans selection:bg-gold/30 selection:text-white overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div 
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
        >
            {renderContent()}
        </motion.div>
      </AnimatePresence>

      {viewingUser && (
        <UserProfileModal
          username={viewingUser}
          posts={posts}
          following={following}
          currentUsername={userProfile.username}
          onToggleFollow={handleToggleFollow}
          onMessage={handleOpenChat}
          onClose={() => setViewingUser(null)}
        />
      )}
      <NavBar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onOpenCreate={() => setIsCreateOpen(true)} 
      />

      {/* Overlays */}
      <AnimatePresence>
        {activeConversationId && conversations.some(c => c.id === activeConversationId) && (
          <ChatDetail 
             key="chat-detail"
             conversation={conversations.find(c => c.id === activeConversationId)!}
             onBack={() => setActiveConversationId(null)}
             onSend={handleSendMessage}
          />
        )}
      </AnimatePresence>

      <CreateModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onShare={handleCreatePost} />
      
      <EditProfileModal 
        isOpen={isEditProfileOpen} 
        onClose={() => setIsEditProfileOpen(false)} 
        profile={userProfile}
        onSave={handleUpdateProfile}
      />
    </div>
  );
};

// Safety net: one broken screen must never turn the whole app white.
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("App crashed", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-8 text-center">
        <p className="font-script text-3xl mb-3">My Social</p>
        <p className="text-sm text-zinc-400 mb-6">Something went wrong. Your data is safe.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-10 px-6 rounded-full bg-gold text-black text-[12px] uppercase tracking-[0.16em] font-medium"
        >
          Reload
        </button>
      </div>
    );
  }
}

// Bump DATA_VERSION only when the shape of saved data changes, and add a migration here.
const DATA_VERSION = 1;
try {
  const savedVersion = Number(localStorage.getItem("mysocial_data_version") || "0");
  if (savedVersion < DATA_VERSION) {
    localStorage.setItem("mysocial_data_version", String(DATA_VERSION));
  }
} catch (e) {
  console.error("Storage unavailable", e);
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default App;
