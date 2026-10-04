import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  Bell,
  BookmarkSimple,
  Buildings,
  CalendarBlank,
  Camera,
  CaretCircleDown,
  CaretDown,
  Rows,
  PencilSimple,
  Envelope,
  ListChecks,
  Phone,
  CaretLeft,
  CaretRight,
  CaretUp,
  Check,
  CheckCircle,
  CheckSquare,
  CircleNotch,
  Hash,
  Info,
  LinkSimple,
  ChatCircleText,
  Minus,
  Plus,
  Question,
  Kanban,
  MagnifyingGlass,
  SealCheck,
  SortAscending,
  Eye,
  EyeSlash,
  ShieldCheck,
  Table,
  TextT,
  Trash,
  UsersThree,
  UploadSimple,
  User,
  Warning,
  X,
  XCircle,
  type Icon,
  type IconProps,
} from "@phosphor-icons/react"

/**
 * The one icon set: Phosphor, in its bold weight, drawn on one grid at one
 * stroke. Everything imports from here, under short names, so a weight or a
 * library change happens in this file only.
 */
const bold =
  (Glyph: Icon) =>
  (props: IconProps): React.JSX.Element => <Glyph weight="bold" {...props} />

export const ArrowDownIcon = bold(ArrowDown)
export const ArrowLeftIcon = bold(ArrowLeft)
export const ArrowRightIcon = bold(ArrowRight)
export const BadgeCheckIcon = bold(SealCheck)
export const BellIcon = bold(Bell)
export const BookmarkIcon = bold(BookmarkSimple)
export const BuildingsIcon = bold(Buildings)
export const CalendarIcon = bold(CalendarBlank)
export const CameraIcon = bold(Camera)
export const CheckIcon = bold(Check)
export const ChevronDownIcon = bold(CaretDown)
export const ChevronLeftIcon = bold(CaretLeft)
export const ChevronRightIcon = bold(CaretRight)
export const ChevronUpIcon = bold(CaretUp)
export const CircleCheckIcon = bold(CheckCircle)
export const CircleChevronDownIcon = bold(CaretCircleDown)
export const CircleHelpIcon = bold(Question)
export const ExternalLinkIcon = bold(ArrowSquareOut)
export const HashIcon = bold(Hash)
export const InfoIcon = bold(Info)
export const LinkIcon = bold(LinkSimple)
export const Loader2Icon = bold(CircleNotch)
export const MinusIcon = bold(Minus)
export const OctagonXIcon = bold(XCircle)
export const PlusIcon = bold(Plus)
export const SquareCheckIcon = bold(CheckSquare)
export const TriangleAlertIcon = bold(Warning)
export const TypeIcon = bold(TextT)
export const UploadIcon = bold(UploadSimple)
export const UserRoundIcon = bold(User)
export const XIcon = bold(X)
export const ShieldCheckIcon = bold(ShieldCheck)
export const BoardIcon = bold(Kanban)
export const TableIcon = bold(Table)
export const RowsIcon = bold(Rows)
export const PencilIcon = bold(PencilSimple)
export const EnvelopeIcon = bold(Envelope)
export const ListChecksIcon = bold(ListChecks)
export const PhoneIcon = bold(Phone)
export const PeopleIcon = bold(UsersThree)
export const TrashIcon = bold(Trash)
export const SortIcon = bold(SortAscending)
export const EyeIcon = bold(Eye)
export const EyeSlashIcon = bold(EyeSlash)
export const MessageIcon = bold(ChatCircleText)
export const SearchIcon = bold(MagnifyingGlass)
