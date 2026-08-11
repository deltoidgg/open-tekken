param(
  [string]$WindowTitle = "Tekken 5",
  [ValidateRange(1, 255)]
  [int]$VirtualKey = 0x55,
  [ValidateRange(1, 2000)]
  [int]$HoldMilliseconds = 80,
  [switch]$ReleaseOnly
)

$ErrorActionPreference = "Stop"

$source = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class Tekken5Pcsx2KeyPulseNative
{
    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);

    private static IntPtr FindWindow(string title)
    {
        IntPtr match = IntPtr.Zero;
        EnumWindows(delegate(IntPtr window, IntPtr parameter)
        {
            if (!IsWindowVisible(window)) return true;
            StringBuilder text = new StringBuilder(512);
            GetWindowText(window, text, text.Capacity);
            if (String.Equals(text.ToString(), title, StringComparison.Ordinal))
            {
                match = window;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return match;
    }

    public static void Pulse(string title, byte virtualKey, int holdMilliseconds)
    {
        const uint KeyUp = 0x0002;
        IntPtr window = FindWindow(title);
        if (window == IntPtr.Zero)
        {
            throw new InvalidOperationException("Could not find window: " + title);
        }
        if (GetForegroundWindow() != window && !SetForegroundWindow(window))
        {
            throw new InvalidOperationException("Could not activate window: " + title);
        }
        Thread.Sleep(40);
        keybd_event(virtualKey, 0, 0, UIntPtr.Zero);
        try
        {
            Thread.Sleep(holdMilliseconds);
        }
        finally
        {
            keybd_event(virtualKey, 0, KeyUp, UIntPtr.Zero);
        }
    }

    public static void Release(string title, byte virtualKey)
    {
        const uint KeyUp = 0x0002;
        IntPtr window = FindWindow(title);
        if (window == IntPtr.Zero)
        {
            throw new InvalidOperationException("Could not find window: " + title);
        }
        if (!SetForegroundWindow(window))
        {
            throw new InvalidOperationException("Could not activate window: " + title);
        }
        Thread.Sleep(40);
        keybd_event(virtualKey, 0, KeyUp, UIntPtr.Zero);
    }
}
'@

Add-Type -TypeDefinition $source
if ($ReleaseOnly) {
  [Tekken5Pcsx2KeyPulseNative]::Release($WindowTitle, [byte]$VirtualKey)
  Write-Host ("Released virtual key 0x{0:X2} in '{1}'" -f $VirtualKey, $WindowTitle)
}
else {
  [Tekken5Pcsx2KeyPulseNative]::Pulse(
    $WindowTitle,
    [byte]$VirtualKey,
    $HoldMilliseconds
  )
  Write-Host (
    "Pulsed virtual key 0x{0:X2} in '{1}' for {2} ms" -f `
      $VirtualKey,
      $WindowTitle,
      $HoldMilliseconds
  )
}
