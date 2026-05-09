/**
 * MUI Icons Wrapper - Provides lucide-style interface for MUI icons
 * This allows existing code to use size={N} instead of sx={{ fontSize: N }}
 */

import React from 'react';
import * as MuiIcons from '@mui/icons-material';

/**
 * Creates a wrapper component that accepts lucide-style props (size, style, etc.)
 * and converts them to MUI props
 */
const createIconWrapper = (MuiIconComponent) => {
  const IconWrapper = ({ size, style, ...props }) => {
    const muiStyle = {
      fontSize: size ? `${size}px` : 'inherit',
      ...style,
    };
    return <MuiIconComponent style={muiStyle} {...props} />;
  };
  IconWrapper.displayName = `IconWrapper(${MuiIconComponent.displayName || 'Icon'})`;
  return IconWrapper;
};

/**
 * Icon configuration: each entry maps MUI icon name to lucide-style aliases
 * Format: { mui: 'MuiIconName', export?: 'ExportName', aliases: [...] }
 * If export is omitted, it defaults to mui + 'Icon'
 */
const iconConfig = [
  { mui: 'Add', aliases: ['Plus'] },
  { mui: 'Delete', aliases: ['Trash2'] },
  { mui: 'Edit', aliases: ['Edit2'] },
  { mui: 'Search', aliases: [] },
  { mui: 'Visibility', aliases: ['Eye'] },
  { mui: 'VisibilityOff', aliases: ['EyeOff'] },
  { mui: 'Menu', aliases: [] },
  { mui: 'Close', aliases: ['X'] },
  { mui: 'Save', aliases: [] },
  { mui: 'ChevronLeft', aliases: [] },
  { mui: 'ChevronRight', aliases: [] },
  { mui: 'ExpandLess', aliases: ['ChevronUp'] },
  { mui: 'ExpandMore', aliases: ['ChevronDown'] },
  { mui: 'GridView', aliases: ['Grid'] },
  { mui: 'Description', aliases: ['FileText'] },
  { mui: 'Download', aliases: [] },
  { mui: 'Upload', aliases: [] },
  { mui: 'FileCopy', aliases: ['Copy'] },
  { mui: 'Folder', aliases: [] },
  { mui: 'FolderOpen', aliases: [] },
  { mui: 'CreateNewFolder', aliases: ['FolderPlus'] },
  { mui: 'Code', aliases: ['FileCode'] },
  { mui: 'ViewWeek', aliases: ['Layout'] },
  { mui: 'Storage', aliases: ['Database', 'HardDrive'] },
  { mui: 'Check', aliases: [] },
  { mui: 'CheckCircle', aliases: ['CheckCircle2'] },
  { mui: 'Warning', aliases: ['AlertCircle', 'AlertTriangle'] },
  { mui: 'Refresh', aliases: ['RefreshCw'] },
  { mui: 'AccessTime', aliases: ['Clock'] },
  { mui: 'Info', aliases: [] },
  { mui: 'History', aliases: [] },
  { mui: 'Monitor', aliases: [] },
  { mui: 'Minimize', aliases: ['Minimize2'] },
  { mui: 'Fullscreen', export: 'MaximizeIcon', aliases: ['Maximize2'] },
  { mui: 'DragHandle', aliases: ['GripVertical'] },
  { mui: 'NightsStay', aliases: ['Moon'] },
  { mui: 'WbSunny', aliases: ['Sun'] },
  { mui: 'Logout', aliases: ['LogOut'] },
  { mui: 'Dashboard', aliases: ['LayoutDashboard'] },
  { mui: 'People', aliases: ['Users'] },
  { mui: 'Settings', aliases: [] },
  { mui: 'TextFields', aliases: ['Type'] },
  { mui: 'RssFeed', aliases: ['Rss'] },
  { mui: 'Mail', aliases: [] },
  { mui: 'Security', aliases: ['Shield'] },
  { mui: 'Explore', aliases: ['Compass'] },
  { mui: 'Star', aliases: ['Sparkles'] },
  { mui: 'Layers', aliases: [] },
  { mui: 'GridOn', aliases: ['LayoutGrid'] },
  { mui: 'ArrowBack', aliases: ['ArrowLeft'] },
  { mui: 'Image', aliases: [] },
  { mui: 'FiberManualRecord', aliases: ['Circle'] },
  { mui: 'CheckBox', aliases: ['CheckSquare'] },
  { mui: 'CheckBoxOutlineBlank', aliases: ['Square'] },
  { mui: 'LocalOffer', aliases: ['Tag'] },
  { mui: 'Inbox', aliases: [] },
  { mui: 'Person', aliases: ['User'] },
  { mui: 'PersonAdd', aliases: ['UserPlus'] },
  { mui: 'PersonRemove', aliases: ['UserX'] },
  { mui: 'VpnKey', aliases: ['Key'] },
  { mui: 'Cancel', aliases: ['XCircle'] },
  { mui: 'Tune', aliases: ['SlidersHorizontal'] },
  { mui: 'Undo', aliases: ['RotateCcw'] },
  { mui: 'Autorenew', aliases: ['Loader'] },
  { mui: 'CompareArrows', aliases: ['GitCompare'] },
  { mui: 'TouchApp', aliases: ['MousePointerClick'] },
  { mui: 'Help', aliases: ['HelpCircle'] },
  { mui: 'List', aliases: [] },
  { mui: 'FormatQuote', aliases: ['Quote'] },
  { mui: 'FormatAlignLeft', aliases: ['AlignLeft'] },
  { mui: 'MenuBook', aliases: ['BookOpen'] },
  { mui: 'CompassCalibration', aliases: [] },
  { mui: 'Numbers', aliases: ['Hash'] },
  { mui: 'RemoveCircle', aliases: ['ShieldOff'] },
  { mui: 'Anchor', aliases: [] },
  { mui: 'Public', aliases: ['Globe'] },
  { mui: 'NavigateBefore', aliases: ['Indent'] },
  { mui: 'NavigateNext', aliases: ['Outdent'] },
  { mui: 'HighlightOff', aliases: [] },
  { mui: 'DataUsage', aliases: [] },
  { mui: 'FormatIndentIncrease', aliases: [] },
  { mui: 'FormatIndentDecrease', aliases: [] },
  { mui: 'TrendingUp', aliases: [] },
  { mui: 'DashboardCustomize', aliases: [] },
  { mui: 'Palette', aliases: [] },
  { mui: 'Functions', aliases: [] },
  { mui: 'Favorite', aliases: ['Heart'] },
  { mui: 'ViewColumn', aliases: ['Columns'] },
];

// Auto-generate and export all icons
const exportedIcons = {};

iconConfig.forEach(({ mui, export: exportName, aliases }) => {
  const wrapped = createIconWrapper(MuiIcons[mui]);
  const iconName = exportName || (mui + 'Icon');
  
  // Export with *Icon suffix (or custom export name)
  exportedIcons[iconName] = wrapped;
  
  // Export with base name
  exportedIcons[mui] = wrapped;
  
  // Export all aliases
  aliases.forEach(alias => {
    exportedIcons[alias] = wrapped;
  });
});

// Export all icons as named exports
export const {
  AddIcon, Add, Plus,
  DeleteIcon, Delete, Trash2,
  EditIcon, Edit, Edit2,
  SearchIcon, Search,
  VisibilityIcon, Eye,
  VisibilityOffIcon, EyeOff,
  MenuIcon, Menu,
  CloseIcon, X,
  SaveIcon, Save,
  ChevronLeftIcon, ChevronLeft,
  ChevronRightIcon, ChevronRight,
  ExpandLessIcon, ChevronUp,
  ExpandMoreIcon, ChevronDown,
  GridViewIcon, Grid,
  DescriptionIcon, FileText,
  DownloadIcon, Download,
  UploadIcon, Upload,
  FileCopyIcon, Copy,
  FolderIcon, Folder,
  FolderOpenIcon, FolderOpen,
  CreateNewFolderIcon, FolderPlus,
  CodeIcon, Code, FileCode,
  ViewWeekIcon, Layout,
  StorageIcon, Database, HardDrive,
  CheckIcon, Check,
  CheckCircleIcon, CheckCircle, CheckCircle2,
  WarningIcon, AlertCircle, AlertTriangle,
  RefreshIcon, RefreshCw,
  AccessTimeIcon, Clock,
  InfoIcon, Info,
  HistoryIcon, History,
  MonitorIcon, Monitor,
  MinimizeIcon, Minimize2,
  MaximizeIcon, Maximize2,
  DragHandleIcon, GripVertical,
  NightsStayIcon, Moon,
  WbSunnyIcon, Sun,
  LogoutIcon, LogOut,
  DashboardIcon, LayoutDashboard,
  PeopleIcon, Users,
  SettingsIcon, Settings,
  TextFieldsIcon, Type,
  RssFeedIcon, Rss,
  MailIcon, Mail,
  SecurityIcon, Shield,
  ExploreIcon, Compass,
  StarIcon, Sparkles,
  LayersIcon, Layers,
  GridOnIcon, LayoutGrid,
  ArrowBackIcon, ArrowLeft,
  ImageIcon, Image,
  FiberManualRecordIcon, Circle,
  CheckBoxIcon, CheckSquare,
  CheckBoxOutlineBlankIcon, Square,
  LocalOfferIcon, Tag,
  InboxIcon, Inbox,
  PersonIcon, User,
  PersonAddIcon, UserPlus,
  PersonRemoveIcon, UserX,
  VpnKeyIcon, Key,
  CancelIcon, XCircle,
  TuneIcon, SlidersHorizontal,
  UndoIcon, RotateCcw,
  AutorenewIcon, Loader,
  CompareArrowsIcon, GitCompare,
  TouchAppIcon, MousePointerClick,
  HelpIcon, HelpCircle,
  ListIcon, List,
  FormatQuoteIcon, Quote,
  FormatAlignLeftIcon, AlignLeft,
  MenuBookIcon, BookOpen,
  CompassCalibrationIcon, CompassCalibration,
  NumbersIcon, Hash,
  RemoveCircleIcon, ShieldOff,
  AnchorIcon, Anchor,
  PublicIcon, Globe,
  NavigateBeforeIcon, Indent,
  NavigateNextIcon, Outdent,
  HighlightOffIcon,
  DataUsageIcon,
  FormatIndentIncrease,
  FormatIndentDecrease,
  TrendingUp,
  DashboardCustomize,
  PaletteIcon, Palette,
  FunctionsIcon, Functions,
  FavoriteIcon, Favorite, Heart,
  ViewColumnIcon, ViewColumn, Columns,
} = exportedIcons;

export default exportedIcons;

