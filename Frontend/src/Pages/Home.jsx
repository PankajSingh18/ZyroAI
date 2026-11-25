import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bot,
  Check,
  ChevronDown,
  Coins,
  CreditCard,
  ImagePlus,
  LoaderCircle,
  LogOut,
  Orbit,
  Plus,
  Send,
  Trash2,
  UserRound,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSelector, useDispatch } from "react-redux";
import { setUserData } from "@/redux/userSlice";
import { logout } from "@/features/auth";
import {
  agentChat,
  analyzeUploadedImage,
  chat,
  decideAgentAction,
} from "@/features/chat";
import { getAllAgents } from "@/features/agent";
import {
  setAgents,
  setAgentsLoading,
  setSelectedAgent,
} from "@/redux/agentSlice";
import { PlugZap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const iconBtn =
  "h-11 w-11 rounded-xl border border-violet-300/20 bg-violet-400/[0.08] p-0 text-violet-100 shadow-sm shadow-violet-500/10 transition hover:border-violet-300/40 hover:bg-violet-400/[0.14] hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/50";
const menuContent = "border-white/10 bg-[#1e2029] text-white";
const menuSeparator = "bg-white/10";

const getApprovalRequest = (response, agentId, threadId) => {
  if (response?.approvalRequest) return response.approvalRequest;
  const interruptValue = response?.interrupts?.[0]?.value;
  if (!interruptValue) return null;
  return {
    ...interruptValue,
    approvalId: interruptValue.approvalId || interruptValue.tool_call_id,
    agentId: response.agentId || agentId,
    threadId: response.threadId || threadId,
  };
};

const normalizeApprovalType = (type) =>
  ({
    email_approval: "email",
    calendar_event_approval: "calendar",
    instagram_post_approval: "instagram",
  })[type] || type;

const formatApprovalDateTime = (value, timeZone) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not provided";

  const options = { dateStyle: "medium", timeStyle: "short" };
  try {
    return date.toLocaleString("en-IN", {
      ...options,
      timeZone: timeZone || "Asia/Kolkata",
    });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return date.toLocaleString("en-IN", options);
  }
};

function Home() {
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [sending, setSending] = useState(false);
  const [approvalInFlight, setApprovalInFlight] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(null);
  const [threadId, setThreadId] = useState("");
  const { selectedAgent, agents, agentsLoading } = useSelector(
    (state) => state.agent,
  );
  const { userData } = useSelector((state) => state.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const imageInputRef = React.useRef(null);
  const hasPendingApproval = Boolean(pendingApproval?.approvalId);

  const uploadToCloudinary = async (file) => {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_PRESET;
    if (!cloudName || !uploadPreset) {
      throw new Error(
        "Cloudinary config missing. Check the frontend .env settings.",
      );
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: "POST", body: formData },
    );
    const result = await response.json();
    if (!response.ok) {
      throw new Error(
        result?.error?.message || "Image upload to Cloudinary failed.",
      );
    }
    if (!result?.secure_url) {
      throw new Error("Cloudinary did not return a secure image URL.");
    }
    return result;
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      await logout();
      dispatch(setUserData(null));
      navigate("/login", { replace: true });
    } finally {
      setLogoutLoading(false);
    }
  };

  const createPendingApproval = (
    response,
    agentId,
    currentThreadId,
    extraContent,
  ) => {
    const approvalRequest = getApprovalRequest(
      response,
      agentId,
      currentThreadId,
    );
    if (!approvalRequest) return false;

    setPendingApproval({
      ...approvalRequest,
      type: normalizeApprovalType(approvalRequest.type),
    });
    const content = [
      approvalRequest.message || response?.aiResponse,
      extraContent,
    ]
      .filter(Boolean)
      .join("\n\n");
    setMessages((current) => [...current, { role: "assistant", content }]);
    return true;
  };

  const handleApprovalDecision = async (approved) => {
    if (!pendingApproval?.approvalId || approvalInFlight) return;

    setApprovalInFlight(true);
    try {
      const result = await decideAgentAction(pendingApproval, approved);
      const nextApprovalRequest = getApprovalRequest(
        result,
        pendingApproval.agentId,
        pendingApproval.threadId,
      );
      setPendingApproval(
        nextApprovalRequest
          ? {
              ...nextApprovalRequest,
              type: normalizeApprovalType(nextApprovalRequest.type),
            }
          : null,
      );
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            nextApprovalRequest?.message ||
            result.aiResponse ||
            (result.decision === "rejected"
              ? "Action rejected."
              : pendingApproval.type === "instagram"
                ? "Instagram publishing resumed. Check the action result above."
                : "Approval complete. Check the action result above."),
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            error?.response?.data?.message ||
            (pendingApproval.type === "instagram"
              ? "Unable to resume Instagram publishing."
              : "Unable to process this approval."),
        },
      ]);
      setPendingApproval(null);
    } finally {
      setApprovalInFlight(false);
    }
  };

  useEffect(() => {
    let active = true;
    dispatch(setAgentsLoading(true));
    getAllAgents()
      .then((data) => {
        if (active) dispatch(setAgents(Array.isArray(data) ? data : []));
      })
      .catch(() => {
        if (active) dispatch(setAgents([]));
      })
      .finally(() => {
        if (active) dispatch(setAgentsLoading(false));
      });
    return () => {
      active = false;
    };
  }, [dispatch]);

  const handleSend = async (event) => {
    if (event?.preventDefault) event.preventDefault();
    const value = message.trim();
    const image = selectedImage;
    if ((!value && !image) || sending || hasPendingApproval) return;

    const userMessage = {
      role: "user",
      content:
        value ||
        "Analyze this image and describe its important visible details.",
      ...(image ? { imageDataUrl: image.dataUrl } : {}),
    };
    setMessages((current) => [...current, userMessage]);
    setMessage("");
    setSending(true);

    try {
      if (image) {
        const uploadedImage = image.secureUrl
          ? { secure_url: image.secureUrl }
          : await uploadToCloudinary(image.file);
        if (!uploadedImage.public_id && !image.publicId) {
          throw new Error("Cloudinary did not return an image public ID.");
        }
        const publicId = uploadedImage.public_id || image.publicId;
        setSelectedImage((current) =>
          current
            ? {
                ...current,
                secureUrl: uploadedImage.secure_url,
                publicId,
              }
            : current,
        );
        const modelContent = [
          userMessage.content,
          "",
          "Image to analyze:",
          `Image URL: ${uploadedImage.secure_url}`,
        ].join("\n");
        setMessages((current) =>
          current.map((item) =>
            item === userMessage ? { ...item, modelContent } : item,
          ),
        );

        let assistantContent;
        if (selectedAgent) {
          const agentPayload =
            typeof selectedAgent === "object"
              ? selectedAgent
              : { name: selectedAgent };
          const agentResponse = await agentChat(
            modelContent,
            agentPayload,
            threadId || undefined,
          );
          if (agentResponse?.isAxiosError || agentResponse instanceof Error) {
            throw new Error(
              agentResponse.response?.data?.message ||
                agentResponse.message ||
                "Agent image analysis failed.",
            );
          }
          if (agentResponse?.threadId) setThreadId(agentResponse.threadId);
          if (
            createPendingApproval(
              agentResponse,
              agentPayload?._id,
              agentResponse?.threadId || threadId,
              `Uploaded image: [View on Cloudinary](${uploadedImage.secure_url})`,
            )
          ) {
            setSelectedImage(null);
            return;
          }
          assistantContent =
            agentResponse?.aiResponse || agentResponse?.response?.data?.message;
          if (!assistantContent) {
            throw new Error("The agent returned an empty image analysis.");
          }
        } else {
          const analysisResponse = await analyzeUploadedImage(
            uploadedImage.secure_url,
            userMessage.content,
          );
          assistantContent = analysisResponse?.analysis;
          if (!assistantContent) {
            throw new Error("Image analysis returned an empty response.");
          }
        }

        setSelectedImage(null);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `${assistantContent}\n\nUploaded image: [View on Cloudinary](${uploadedImage.secure_url})`,
          },
        ]);
        return;
      }

      if (!selectedAgent) {
        const res = await chat(value, threadId || undefined);
        if (res?.threadId) setThreadId(res.threadId);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              res?.aiResponse ||
              res?.content ||
              res?.response?.data?.message ||
              "something went wrong",
          },
        ]);
        return;
      } else {
        const agentPayload =
          typeof selectedAgent === "object"
            ? selectedAgent
            : { name: selectedAgent };
        const res = await agentChat(value, agentPayload, threadId || undefined);
        if (res?.threadId) setThreadId(res.threadId);
        if (
          createPendingApproval(
            res,
            agentPayload?._id,
            res?.threadId || threadId,
          )
        )
          return;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              res?.aiResponse ||
              res?.response?.data?.message ||
              "something went wrong",
          },
        ]);
        return;
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error?.response?.data?.message ||
            error?.message ||
            "something went wrong",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const renderApprovalCards = () => {
    if (!pendingApproval) return null;

    const title =
      {
        email: "Review email before sending",
        calendar: "Review calendar event",
        instagram: "Review Instagram post",
      }[pendingApproval.type] || "Review requested action";
    const approveLabel =
      {
        email: "Approve & Send",
        calendar: "Approve & Create",
        instagram: "Approve & Publish",
      }[pendingApproval.type] || "Approve";
    const renderField = (label, value, className = "") => (
      <div>
        <p className="mb-1 text-[11px] text-zinc-500">{label}</p>
        <p className={`break-words text-sm text-zinc-200 ${className}`}>
          {value || "Not provided"}
        </p>
      </div>
    );
    let detailsContent;

    if (pendingApproval.type === "email") {
      detailsContent = (
        <div className="space-y-3">
          {renderField("To", pendingApproval.email?.to)}
          {renderField("Subject", pendingApproval.email?.subject)}
          {renderField(
            "Body",
            pendingApproval.email?.body,
            "whitespace-pre-wrap",
          )}
        </div>
      );
    } else if (pendingApproval.type === "calendar") {
      const event = pendingApproval.event || {};
      detailsContent = (
        <div className="space-y-3">
          {renderField("Title", event.summary)}
          {renderField("Description", event.description)}
          {renderField(
            "Start",
            formatApprovalDateTime(event.startDateTime, event.timeZone),
          )}
          {renderField(
            "End",
            formatApprovalDateTime(event.endDateTime, event.timeZone),
          )}
          {renderField("Time zone", event.timeZone || "Asia/Kolkata")}
        </div>
      );
    } else if (pendingApproval.type === "instagram") {
      detailsContent = (
        <div className="space-y-3">
          {pendingApproval.imageUrl && (
            <a
              href={pendingApproval.imageUrl}
              target="_blank"
              rel="noreferrer"
              className="block"
            >
              <img
                src={pendingApproval.imageUrl}
                alt="Instagram post preview"
                className="max-h-56 max-w-full rounded-lg object-contain"
              />
            </a>
          )}
          {renderField(
            "Caption",
            pendingApproval.caption,
            "whitespace-pre-wrap",
          )}
        </div>
      );
    } else {
      const details =
        pendingApproval.post ||
        pendingApproval.args ||
        (pendingApproval.imageUrl || pendingApproval.caption
          ? {
              imageUrl: pendingApproval.imageUrl,
              caption: pendingApproval.caption,
            }
          : {});
      detailsContent = (
        <div className="space-y-2 text-xs text-zinc-300">
          {Object.entries(details).map(([key, value]) => (
            <div key={key}>
              <span className="font-medium capitalize text-zinc-400">
                {key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}:
              </span>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-zinc-200">
                {String(value)}
              </p>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3">
        <h3 className="mb-3 text-sm font-semibold text-amber-100">{title}</h3>
        {detailsContent}
        {pendingApproval.approvalId && (
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={approvalInFlight}
              onClick={() => handleApprovalDecision(false)}
              className="h-8 rounded-xl border-red-500/25 bg-transparent text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              <X size={14} className="mr-2 size-4" />
              {approvalInFlight ? "Processing..." : "Reject"}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={approvalInFlight}
              onClick={() => handleApprovalDecision(true)}
              className="h-8 rounded-xl bg-white text-zinc-900 hover:bg-zinc-200"
            >
              {approvalInFlight ? (
                <LoaderCircle size={14} className="mr-2 animate-spin" />
              ) : (
                <Check size={14} className="mr-2 size-4" />
              )}
              {approvalInFlight ? "Processing..." : approveLabel}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,#2b2f3a_0%,#191b21_55%,#121317_100%)] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.35)_100%)]"
      />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <header className="z-30 flex h-[4.5rem] shrink-0 items-center justify-between px-4 sm:px-6">
          <Link to={"/"} className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25">
              <Orbit size={21} />
            </span>
            <span className="text-3xl font-bold tracking-[-0.06em] text-white">
              Zyro<span className="text-violet-300">AI</span>
            </span>
          </Link>

          <div className="flex items-center gap-2.5">
            {/* Workspace menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  aria-label="Open workspace menu"
                  variant="outline"
                  className={iconBtn}
                >
                  <Workflow size={20} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={`w-64 rounded-2xl p-2 shadow-xl shadow-black/30 ${menuContent}`}
              >
                <DropdownMenuLabel className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  Workspace
                </DropdownMenuLabel>
                <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-violet-300/15 bg-violet-400/[0.08] text-violet-300">
                    <Coins size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] text-zinc-400">
                      Available credits
                    </span>
                    <span className="block text-sm font-semibold text-white">
                      {Number(userData?.credits ?? 0).toLocaleString("en-IN")}
                    </span>
                  </span>
                </div>
                <DropdownMenuSeparator className={`${menuSeparator} my-2`} />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer gap-2.5 rounded-xl px-3 py-2.5 text-zinc-200 focus:bg-violet-400/[0.1] focus:text-white"
                  >
                    <Link
                      to="/agents"
                      className="flex w-full items-center gap-2.5"
                    >
                      <Bot size={15} className="text-violet-300" />
                      My Agents
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator className={`${menuSeparator} my-2`} />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 text-zinc-200 focus:bg-violet-400/[0.1] focus:text-white"
                  >
                    <Link
                      to="/agents/new"
                      className="flex w-full items-start gap-2.5 whitespace-normal"
                    >
                      <Plus
                        size={15}
                        className="mt-0.5 shrink-0 text-violet-300"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">
                          Create New Agent
                        </span>
                      </span>
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator className={`${menuSeparator} my-2`} />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer gap-2.5 rounded-xl px-3 py-2.5 text-zinc-200 focus:bg-violet-400/[0.1] focus:text-white"
                  >
                    <Link
                      to="/integration"
                      className="flex w-full items-center gap-2.5"
                    >
                      <PlugZap size={15} className="text-violet-300" />
                      Integration
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer gap-2.5 rounded-xl px-3 py-2.5 text-zinc-200 focus:bg-violet-400/[0.1] focus:text-white"
                  >
                    <Link
                      to="/pricing"
                      className="flex w-full items-center gap-2.5"
                    >
                      <CreditCard size={15} className="text-violet-300" />
                      Pricing
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Profile dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Open profile menu"
                  className="flex size-11 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] shadow-sm transition hover:border-violet-300/40 hover:bg-violet-400/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                >
                  {userData?.profilePicture ? (
                    <img
                      src={userData?.profilePicture}
                      alt="avatar"
                      className="size-full object-cover"
                    />
                  ) : (
                    <UserRound size={20} />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={`w-64 ${menuContent}`}
              >
                <DropdownMenuLabel>Signed in</DropdownMenuLabel>
                <div className="flex items-center gap-2.5 px-2 py-1.5">
                  <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.05]">
                    {userData?.profilePicture ? (
                      <img
                        src={userData?.profilePicture}
                        alt="avatar"
                        className="size-full object-cover"
                      />
                    ) : (
                      <UserRound size={14} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">
                      {userData?.name || "User"}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {userData?.email || "email"}
                    </p>
                  </div>
                </div>
                <DropdownMenuSeparator className={menuSeparator} />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer gap-2.5 rounded-xl py-2.5 text-red-400 focus:bg-red-500/10 focus:text-red-400"
                >
                  {logoutLoading ? (
                    "Logging out..."
                  ) : (
                    <>
                      <LogOut size={16} /> Logout
                    </>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 sm:px-6">
          {messages.length === 0 ? (
            <section className="flex flex-1 flex-col items-center justify-center pb-8 text-center">
              <div className="mb-7 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-400 to-fuchsia-500 text-white shadow-lg shadow-violet-500/20">
                <Orbit size={24} />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {selectedAgent?.name
                  ? `Chat with ${selectedAgent.name}`
                  : userData?.name
                    ? `Hi, ${userData.name}`
                    : "Welcome to ZyroAI"}
              </h1>
              <p className="mt-3 max-w-md text-sm leading-6 text-zinc-400">
                Ask questions, automate tasks, or upload an image to prepare an
                Instagram post.
              </p>
              {!selectedAgent && (
                <div className="mt-8 w-full max-w-lg rounded-2xl border border-violet-300/15 bg-violet-400/[0.06] p-4 text-left shadow-[0_12px_40px_rgba(124,58,237,0.08)] sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-violet-300/15 bg-violet-400/10 text-violet-200">
                      <Bot size={19} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-white">
                        Create an AI agent for your tasks
                      </h2>
                      <p className="mt-1 text-xs leading-5 text-zinc-400">
                        Give it a role, instructions, knowledge, and tools so it
                        can help with a specific kind of work.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-xs text-zinc-500">
                      Customized by you, ready to assist.
                    </span>
                    <Button
                      asChild
                      size="sm"
                      className="shrink-0 rounded-xl bg-white text-zinc-900 hover:bg-zinc-200"
                    >
                      <Link to="/agents/new">
                        <Plus size={15} className="mr-1.5" />
                        Create New Agent
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <section
              className="chat-scroll-area min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto py-6"
              aria-live="polite"
            >
              {messages.map((item, index) => (
                <div
                  key={`${item.role}-${index}`}
                  className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {item.role === "assistant" && (
                    <div className="mr-2 grid size-8 shrink-0 place-items-center rounded-lg bg-white text-zinc-900">
                      <Workflow size={14} />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] break-words px-4 py-3 text-sm leading-6 ${
                      item.role === "user"
                        ? "whitespace-pre-wrap rounded-2xl rounded-br-md bg-white text-zinc-900"
                        : "rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.04] text-zinc-100"
                    }`}
                  >
                    {item.role === "user" && item.imageDataUrl && (
                      <img
                        src={item.imageDataUrl}
                        alt="Uploaded image"
                        className="mb-2 max-h-56 max-w-full rounded-xl object-contain"
                      />
                    )}
                    {item.role === "assistant" ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({ children }) => (
                            <h1 className="mb-3 text-lg font-semibold text-white">
                              {children}
                            </h1>
                          ),
                          h2: ({ children }) => (
                            <h2 className="mb-2 mt-4 text-base font-semibold text-white">
                              {children}
                            </h2>
                          ),
                          h3: ({ children }) => (
                            <h3 className="mb-2 mt-3 font-semibold text-white">
                              {children}
                            </h3>
                          ),
                          p: ({ children }) => (
                            <p className="mb-2 last:mb-0">{children}</p>
                          ),
                          ul: ({ children }) => (
                            <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">
                              {children}
                            </ol>
                          ),
                          li: ({ children }) => (
                            <li className="pl-1">{children}</li>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold text-white">
                              {children}
                            </strong>
                          ),
                          a: ({ children, href }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="break-all text-violet-300 underline underline-offset-2 hover:text-violet-200"
                            >
                              {children}
                            </a>
                          ),
                          table: ({ children }) => (
                            <div className="my-3 max-w-full overflow-x-auto rounded-lg border border-white/10">
                              <table className="min-w-full border-collapse text-left">
                                {children}
                              </table>
                            </div>
                          ),
                          thead: ({ children }) => (
                            <thead className="bg-white/[0.06]">
                              {children}
                            </thead>
                          ),
                          th: ({ children }) => (
                            <th className="border-b border-white/10 px-3 py-2 font-semibold text-white">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td className="border-b border-white/[0.06] px-3 py-2 align-top last:border-b-0">
                              {children}
                            </td>
                          ),
                          blockquote: ({ children }) => (
                            <blockquote className="my-2 border-l-2 border-violet-400/50 pl-3 text-zinc-300">
                              {children}
                            </blockquote>
                          ),
                          code: ({ children }) => (
                            <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs text-violet-200">
                              {children}
                            </code>
                          ),
                        }}
                      >
                        {item.content}
                      </ReactMarkdown>
                    ) : (
                      item.content
                    )}
                  </div>
                </div>
              ))}
              {renderApprovalCards()}
              {sending && (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <LoaderCircle size={16} className="animate-spin" />
                  Thinking...
                </div>
              )}
            </section>
          )}

          <form onSubmit={handleSend} className="pb-4 sm:pb-6">
            {selectedImage && (
              <div className="mb-2 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-2">
                <img
                  src={selectedImage.dataUrl}
                  alt="Selected upload preview"
                  className="size-14 rounded-lg object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-zinc-300">
                    {selectedImage.name}
                  </span>
                  <span className="mt-1 block text-[11px] text-zinc-500">
                    {selectedImage.secureUrl
                      ? "Uploaded to Cloudinary"
                      : "Will upload to Cloudinary when sent"}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label="Remove selected image"
                  onClick={() => setSelectedImage(null)}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop-blur-xl focus-within:border-white/20">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={sending || hasPendingApproval}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  if (
                    !["image/jpeg", "image/png", "image/webp"].includes(
                      file.type,
                    )
                  ) {
                    setMessages((current) => [
                      ...current,
                      {
                        role: "assistant",
                        content: "Please choose a JPEG, PNG, or WebP image.",
                      },
                    ]);
                    return;
                  }
                  if (file.size > 5 * 1024 * 1024) {
                    setMessages((current) => [
                      ...current,
                      {
                        role: "assistant",
                        content: "Image must be 5 MB or smaller.",
                      },
                    ]);
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === "string") {
                      setSelectedImage({
                        name: file.name,
                        dataUrl: reader.result,
                        file,
                      });
                    }
                  };
                  reader.onerror = () => {
                    setMessages((current) => [
                      ...current,
                      {
                        role: "assistant",
                        content: "Unable to read this image file.",
                      },
                    ]);
                  };
                  reader.readAsDataURL(file);
                }}
              />
              <button
                type="button"
                title="Upload an image"
                aria-label="Upload an image"
                onClick={() => imageInputRef.current?.click()}
                disabled={sending || hasPendingApproval}
                className="grid size-10 shrink-0 place-items-center rounded-xl text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
              >
                <ImagePlus size={18} />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    title="Choose agent"
                    disabled={hasPendingApproval}
                    className="flex h-10 max-w-44 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-xs text-zinc-300 hover:bg-white/[0.08] hover:text-white"
                  >
                    <Bot size={14} className="shrink-0" />
                    <span className="truncate">
                      {selectedAgent?.name || "General chat"}
                    </span>
                    <ChevronDown size={13} className="shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className={`w-56 ${menuContent}`}
                >
                  <DropdownMenuLabel>Chat mode</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => {
                      dispatch(setSelectedAgent(null));
                      setMessages([]);
                      setThreadId("");
                      setPendingApproval(null);
                    }}
                    className="cursor-pointer"
                  >
                    <Workflow size={15} /> General chat
                  </DropdownMenuItem>
                  {agentsLoading ? (
                    <DropdownMenuItem disabled>
                      Loading agents...
                    </DropdownMenuItem>
                  ) : (
                    <>
                      {agents.map((agent) => (
                        <DropdownMenuItem
                          key={agent._id}
                          onClick={() => {
                            dispatch(setSelectedAgent(agent));
                            setMessages([]);
                            setThreadId("");
                            setPendingApproval(null);
                          }}
                          className="cursor-pointer"
                        >
                          <Bot size={15} />
                          <span className="truncate">{agent.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <textarea
                value={message}
                disabled={sending || hasPendingApproval}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={1}
                placeholder="Ask ZyroAI anything..."
                className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500"
              />
              <Button
                type="submit"
                size="icon"
                disabled={
                  (!message.trim() && !selectedImage) ||
                  sending ||
                  hasPendingApproval
                }
                className="size-10 shrink-0 rounded-xl bg-white text-zinc-900 hover:bg-zinc-200"
              >
                {sending ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : (
                  <Send size={17} />
                )}
              </Button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}

export default Home;
