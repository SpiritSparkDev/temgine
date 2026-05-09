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

// Export wrapped icons with lucide names for backward compatibility
export const AddIcon = createIconWrapper(MuiIcons.Add);
export const Add = AddIcon; // alias
export const Plus = AddIcon; // lucide name alias

export const DeleteIcon = createIconWrapper(MuiIcons.Delete);
export const Delete = DeleteIcon;
export const Trash2 = DeleteIcon; // lucide name

export const EditIcon = createIconWrapper(MuiIcons.Edit);
export const Edit = EditIcon;
export const Edit2 = EditIcon; // lucide name

export const SearchIcon = createIconWrapper(MuiIcons.Search);
export const Search = SearchIcon;

export const VisibilityIcon = createIconWrapper(MuiIcons.Visibility);
export const Eye = VisibilityIcon;

export const VisibilityOffIcon = createIconWrapper(MuiIcons.VisibilityOff);
export const EyeOff = VisibilityOffIcon;

export const MenuIcon = createIconWrapper(MuiIcons.Menu);
export const Menu = MenuIcon;

export const CloseIcon = createIconWrapper(MuiIcons.Close);
export const X = CloseIcon;

export const SaveIcon = createIconWrapper(MuiIcons.Save);
export const Save = SaveIcon;

export const ChevronLeftIcon = createIconWrapper(MuiIcons.ChevronLeft);
export const ChevronLeft = ChevronLeftIcon;

export const ChevronRightIcon = createIconWrapper(MuiIcons.ChevronRight);
export const ChevronRight = ChevronRightIcon;

export const ExpandLessIcon = createIconWrapper(MuiIcons.ExpandLess);
export const ChevronUp = ExpandLessIcon;

export const ExpandMoreIcon = createIconWrapper(MuiIcons.ExpandMore);
export const ChevronDown = ExpandMoreIcon;

export const GridViewIcon = createIconWrapper(MuiIcons.GridView);
export const Grid = GridViewIcon;

export const DescriptionIcon = createIconWrapper(MuiIcons.Description);
export const FileText = DescriptionIcon;

export const DownloadIcon = createIconWrapper(MuiIcons.Download);
export const Download = DownloadIcon;

export const UploadIcon = createIconWrapper(MuiIcons.Upload);
export const Upload = UploadIcon;

export const FileCopyIcon = createIconWrapper(MuiIcons.FileCopy);
export const Copy = FileCopyIcon;

export const FolderIcon = createIconWrapper(MuiIcons.Folder);
export const Folder = FolderIcon;

export const FolderOpenIcon = createIconWrapper(MuiIcons.FolderOpen);
export const FolderOpen = FolderOpenIcon;

export const CreateNewFolderIcon = createIconWrapper(MuiIcons.CreateNewFolder);
export const FolderPlus = CreateNewFolderIcon;

export const CodeIcon = createIconWrapper(MuiIcons.Code);
export const Code = CodeIcon;
export const FileCode = CodeIcon;

export const ViewWeekIcon = createIconWrapper(MuiIcons.ViewWeek);
export const Layout = ViewWeekIcon;

export const StorageIcon = createIconWrapper(MuiIcons.Storage);
export const Database = StorageIcon;
export const HardDrive = StorageIcon;

export const CheckIcon = createIconWrapper(MuiIcons.Check);
export const Check = CheckIcon;

export const CheckCircleIcon = createIconWrapper(MuiIcons.CheckCircle);
export const CheckCircle = CheckCircleIcon;
export const CheckCircle2 = CheckCircleIcon;

export const WarningIcon = createIconWrapper(MuiIcons.Warning);
export const AlertCircle = WarningIcon;
export const AlertTriangle = WarningIcon;

export const RefreshIcon = createIconWrapper(MuiIcons.Refresh);
export const RefreshCw = RefreshIcon;

export const AccessTimeIcon = createIconWrapper(MuiIcons.AccessTime);
export const Clock = AccessTimeIcon;

export const InfoIcon = createIconWrapper(MuiIcons.Info);
export const Info = InfoIcon;

export const HistoryIcon = createIconWrapper(MuiIcons.History);
export const History = HistoryIcon;

export const MonitorIcon = createIconWrapper(MuiIcons.Monitor);
export const Monitor = MonitorIcon;

export const MinimizeIcon = createIconWrapper(MuiIcons.Minimize);
export const Minimize2 = MinimizeIcon;

export const MaximizeIcon = createIconWrapper(MuiIcons.Fullscreen);
export const Maximize2 = MaximizeIcon;

export const DragHandleIcon = createIconWrapper(MuiIcons.DragHandle);
export const GripVertical = DragHandleIcon;

export const NightsStayIcon = createIconWrapper(MuiIcons.NightsStay);
export const Moon = NightsStayIcon;

export const WbSunnyIcon = createIconWrapper(MuiIcons.WbSunny);
export const Sun = WbSunnyIcon;

export const LogoutIcon = createIconWrapper(MuiIcons.Logout);
export const LogOut = LogoutIcon;

export const DashboardIcon = createIconWrapper(MuiIcons.Dashboard);
export const LayoutDashboard = DashboardIcon;

export const PeopleIcon = createIconWrapper(MuiIcons.People);
export const Users = PeopleIcon;

export const SettingsIcon = createIconWrapper(MuiIcons.Settings);
export const Settings = SettingsIcon;

export const TextFieldsIcon = createIconWrapper(MuiIcons.TextFields);
export const Type = TextFieldsIcon;

export const RssFeedIcon = createIconWrapper(MuiIcons.RssFeed);
export const Rss = RssFeedIcon;

export const MailIcon = createIconWrapper(MuiIcons.Mail);
export const Mail = MailIcon;

export const SecurityIcon = createIconWrapper(MuiIcons.Security);
export const Shield = SecurityIcon;

export const ExploreIcon = createIconWrapper(MuiIcons.Explore);
export const Compass = ExploreIcon;

export const StarIcon = createIconWrapper(MuiIcons.Star);
export const Sparkles = StarIcon;

export const LayersIcon = createIconWrapper(MuiIcons.Layers);
export const Layers = LayersIcon;

export const GridOnIcon = createIconWrapper(MuiIcons.GridOn);
export const LayoutGrid = GridOnIcon;

export const ArrowBackIcon = createIconWrapper(MuiIcons.ArrowBack);
export const ArrowLeft = ArrowBackIcon;

export const ImageIcon = createIconWrapper(MuiIcons.Image);
export const Image = ImageIcon;

export const FiberManualRecordIcon = createIconWrapper(MuiIcons.FiberManualRecord);
export const Circle = FiberManualRecordIcon;

export const CheckBoxIcon = createIconWrapper(MuiIcons.CheckBox);
export const CheckSquare = CheckBoxIcon;

export const CheckBoxOutlineBlankIcon = createIconWrapper(MuiIcons.CheckBoxOutlineBlank);
export const Square = CheckBoxOutlineBlankIcon;

export const LocalOfferIcon = createIconWrapper(MuiIcons.LocalOffer);
export const Tag = LocalOfferIcon;

export const InboxIcon = createIconWrapper(MuiIcons.Inbox);
export const Inbox = InboxIcon;

export const PersonIcon = createIconWrapper(MuiIcons.Person);
export const User = PersonIcon;

export const PersonAddIcon = createIconWrapper(MuiIcons.PersonAdd);
export const UserPlus = PersonAddIcon;

export const PersonRemoveIcon = createIconWrapper(MuiIcons.PersonRemove);
export const UserX = PersonRemoveIcon;

export const VpnKeyIcon = createIconWrapper(MuiIcons.VpnKey);
export const Key = VpnKeyIcon;

export const CancelIcon = createIconWrapper(MuiIcons.Cancel);
export const XCircle = CancelIcon;

export const TuneIcon = createIconWrapper(MuiIcons.Tune);
export const SlidersHorizontal = TuneIcon;

export const UndoIcon = createIconWrapper(MuiIcons.Undo);
export const RotateCcw = UndoIcon;

export const CircularProgressIcon = createIconWrapper(MuiIcons.Autorenew);
export const Loader = CircularProgressIcon;

export const CompareArrowsIcon = createIconWrapper(MuiIcons.CompareArrows);
export const GitCompare = CompareArrowsIcon;

export const TouchAppIcon = createIconWrapper(MuiIcons.TouchApp);
export const MousePointerClick = TouchAppIcon;

export const HelpIcon = createIconWrapper(MuiIcons.Help);
export const HelpCircle = HelpIcon;

export const ListIcon = createIconWrapper(MuiIcons.List);
export const List = ListIcon;

export const FormatQuoteIcon = createIconWrapper(MuiIcons.FormatQuote);
export const Quote = FormatQuoteIcon;

export const FormatAlignLeftIcon = createIconWrapper(MuiIcons.FormatAlignLeft);
export const AlignLeft = FormatAlignLeftIcon;

export const MenuBookIcon = createIconWrapper(MuiIcons.MenuBook);
export const BookOpen = MenuBookIcon;

export const CompassCalibrationIcon = createIconWrapper(MuiIcons.CompassCalibration);
export const CompassCalibration = CompassCalibrationIcon;

export const NumbersIcon = createIconWrapper(MuiIcons.Numbers);
export const Hash = NumbersIcon;

export const RemoveCircleIcon = createIconWrapper(MuiIcons.RemoveCircle);
export const ShieldOff = RemoveCircleIcon;

export const PencilIcon = createIconWrapper(MuiIcons.Edit);
export const Pencil = PencilIcon;

export const ViewModuleIcon = createIconWrapper(MuiIcons.ViewModule);

export const AnchorIcon = createIconWrapper(MuiIcons.Anchor);
export const Anchor = AnchorIcon;

export const PublicIcon = createIconWrapper(MuiIcons.Public);
export const Globe = PublicIcon;

export const NavigateBeforeIcon = createIconWrapper(MuiIcons.NavigateBefore);
export const Indent = NavigateBeforeIcon;

export const NavigateNextIcon = createIconWrapper(MuiIcons.NavigateNext);
export const Outdent = NavigateNextIcon;

export const HighlightOffIcon = createIconWrapper(MuiIcons.HighlightOff);

export const DataUsageIcon = createIconWrapper(MuiIcons.DataUsage);

// Number variant
export const NumbersOutlinedIcon = createIconWrapper(MuiIcons.Numbers);

export const FormatIndentIncrease = createIconWrapper(MuiIcons.FormatIndentIncrease);

export const FormatIndentDecrease = createIconWrapper(MuiIcons.FormatIndentDecrease);

export const TrendingUp = createIconWrapper(MuiIcons.TrendingUp);

export const DashboardCustomize = createIconWrapper(MuiIcons.DashboardCustomize);

export default {
  AddIcon,
  DeleteIcon,
  EditIcon,
  SearchIcon,
  VisibilityIcon,
  VisibilityOffIcon,
  MenuIcon,
  CloseIcon,
  SaveIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExpandLessIcon,
  ExpandMoreIcon,
  GridViewIcon,
  DescriptionIcon,
  DownloadIcon,
  UploadIcon,
  FileCopyIcon,
  FolderIcon,
  FolderOpenIcon,
  CreateNewFolderIcon,
  CodeIcon,
  ViewWeekIcon,
  StorageIcon,
  CheckIcon,
  CheckCircleIcon,
  WarningIcon,
  RefreshIcon,
  AccessTimeIcon,
  InfoIcon,
  HistoryIcon,
  MonitorIcon,
  MinimizeIcon,
  MaximizeIcon,
  DragHandleIcon,
  NightsStayIcon,
  WbSunnyIcon,
  LogoutIcon,
  DashboardIcon,
  PeopleIcon,
  SettingsIcon,
  TextFieldsIcon,
  RssFeedIcon,
  MailIcon,
  SecurityIcon,
  ExploreIcon,
  StarIcon,
  LayersIcon,
  GridOnIcon,
  ArrowBackIcon,
  ImageIcon,
  FiberManualRecordIcon,
  CheckBoxIcon,
  CheckBoxOutlineBlankIcon,
  LocalOfferIcon,
  InboxIcon,
  PersonIcon,
  PersonAddIcon,
  PersonRemoveIcon,
  VpnKeyIcon,
  CancelIcon,
  TuneIcon,
  UndoIcon,
  CircularProgressIcon,
  CompareArrowsIcon,
  TouchAppIcon,
  HelpIcon,
  ListIcon,
  FormatQuoteIcon,
  FormatAlignLeftIcon,
  MenuBookIcon,
  CompassCalibrationIcon,
  NumbersIcon,
  RemoveCircleIcon,
  PencilIcon,
  ViewModuleIcon,
  AnchorIcon,
  PublicIcon,
  NavigateBeforeIcon,
  NavigateNextIcon,
  HighlightOffIcon,
  DataUsageIcon,
};
