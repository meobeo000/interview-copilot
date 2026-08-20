import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SessionDrawer } from "./SessionDrawer";
import { createDefaultSessionConfig } from "../../shared/sessionConfig";

describe("Phase 1: SessionDrawer Component", () => {
  const mockSession1 = createDefaultSessionConfig({
    id: "session-1",
    name: "Phỏng vấn SEO Specialist Tech",
    company: "Acme SEO",
    jobDescription: "Senior Specialist"
  });

  const mockSession2 = createDefaultSessionConfig({
    id: "session-2",
    name: "Phỏng vấn Digital Lead",
    company: "Beta Media",
    jobDescription: "SEO Lead"
  });

  const defaultProps = {
    isOpen: true,
    sessions: [mockSession1, mockSession2],
    activeSession: mockSession1,
    onClose: vi.fn(),
    onSelectAndStart: vi.fn(),
    onCreateSession: vi.fn(),
    onSaveSession: vi.fn(),
    onDuplicateSession: vi.fn(),
    onDeleteSession: vi.fn()
  };

  afterEach(() => {
    cleanup();
  });

  it("renders the session setup drawer with all Phase 1 fields", () => {
    render(<SessionDrawer {...defaultProps} />);

    expect(screen.getByText("Cấu hình Phiên Phỏng vấn (Phase 1)")).toBeInTheDocument();
    expect(screen.getByText("Tạo phiên mới")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Phỏng vấn SEO Specialist Tech")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Acme SEO")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Senior Specialist")).toBeInTheDocument();
    expect(screen.getByText("Bắt đầu phiên phỏng vấn")).toBeInTheDocument();
  });

  it("handles duplicate session action", () => {
    render(<SessionDrawer {...defaultProps} />);

    const duplicateBtn = screen.getByTitle("Nhân bản phiên này");
    fireEvent.click(duplicateBtn);

    expect(defaultProps.onDuplicateSession).toHaveBeenCalledWith("session-1");
  });

  it("handles start session action which snapshots configuration", () => {
    render(<SessionDrawer {...defaultProps} />);

    const startBtn = screen.getByText("Bắt đầu phiên phỏng vấn");
    fireEvent.click(startBtn);

    expect(defaultProps.onSelectAndStart).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
