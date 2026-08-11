param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,
  [string]$ProcessName = "pcsx2-qt",
  [int]$ProcessId = 0,
  [UInt64]$EeBase = 0,
  [ValidateRange(100, 30000)]
  [int]$DurationMilliseconds = 3000,
  [ValidateRange(60, 4000)]
  [int]$SampleRate = 1000,
  [ValidateRange(0, 255)]
  [int]$TriggerVirtualKey = 0,
  [ValidateRange(0, 29000)]
  [int]$TriggerAtMilliseconds = 1000,
  [ValidateRange(1, 2000)]
  [int]$TriggerHoldMilliseconds = 100,
  [ValidateRange(0, 255)]
  [int]$TriggerVirtualKey2 = 0,
  [ValidateRange(0, 29000)]
  [int]$TriggerAtMilliseconds2 = 1100,
  [ValidateRange(1, 2000)]
  [int]$TriggerHoldMilliseconds2 = 100,
  [ValidateRange(0, 255)]
  [int]$TriggerVirtualKey3 = 0,
  [ValidateRange(0, 29000)]
  [int]$TriggerAtMilliseconds3 = 1200,
  [ValidateRange(1, 2000)]
  [int]$TriggerHoldMilliseconds3 = 100,
  [ValidateRange(0, 255)]
  [int]$TriggerVirtualKey4 = 0,
  [ValidateRange(0, 29000)]
  [int]$TriggerAtMilliseconds4 = 1300,
  [ValidateRange(1, 2000)]
  [int]$TriggerHoldMilliseconds4 = 100,
  [ValidateRange(0, 255)]
  [int]$TriggerVirtualKey5 = 0,
  [ValidateRange(0, 29000)]
  [int]$TriggerAtMilliseconds5 = 1400,
  [ValidateRange(1, 2000)]
  [int]$TriggerHoldMilliseconds5 = 100,
  [ValidateRange(0, 255)]
  [int]$TriggerVirtualKey6 = 0,
  [ValidateRange(0, 29000)]
  [int]$TriggerAtMilliseconds6 = 1500,
  [ValidateRange(1, 2000)]
  [int]$TriggerHoldMilliseconds6 = 100,
  [string]$WindowTitle = "Tekken 5"
)

$ErrorActionPreference = "Stop"

$source = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class Tekken5Pcsx2PlayerTraceNative
{
    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [StructLayout(LayoutKind.Sequential)]
    public struct MemoryBasicInformation64
    {
        public ulong BaseAddress;
        public ulong AllocationBase;
        public uint AllocationProtect;
        public uint Alignment1;
        public ulong RegionSize;
        public uint State;
        public uint Protect;
        public uint Type;
        public uint Alignment2;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint access, bool inheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ReadProcessMemory(
        IntPtr process,
        IntPtr address,
        byte[] buffer,
        int size,
        out IntPtr bytesRead
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern UIntPtr VirtualQueryEx(
        IntPtr process,
        UIntPtr address,
        out MemoryBasicInformation64 information,
        UIntPtr length
    );

    [DllImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CloseHandle(IntPtr handle);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr window, int command);

    [DllImport("user32.dll")]
    private static extern void SwitchToThisWindow(IntPtr window, bool altTab);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);

    private static bool Matches(byte[] data, int offset, byte[] pattern)
    {
        for (int index = 0; index < pattern.Length; index++)
        {
            if (data[offset + index] != pattern[index]) return false;
        }
        return true;
    }

    private static bool IsReadable(MemoryBasicInformation64 information)
    {
        const uint MemCommit = 0x1000;
        const uint PageNoAccess = 0x01;
        const uint PageGuard = 0x100;
        return information.State == MemCommit
            && (information.Protect & PageGuard) == 0
            && (information.Protect & 0xff) != PageNoAccess;
    }

    private static bool VerifyBase(IntPtr process, ulong candidate)
    {
        const ulong data1PathAddress = 0x00480d90;
        const ulong ramEndAddress = 0x01ffffff;
        byte[] expected = Encoding.ASCII.GetBytes("cd:\\TK5DATA1.BIN;1");
        byte[] actual = new byte[expected.Length];
        IntPtr bytesRead;
        if (!ReadProcessMemory(
                process,
                new IntPtr(unchecked((long)(candidate + data1PathAddress))),
                actual,
                actual.Length,
                out bytesRead
            ) || bytesRead.ToInt64() != actual.Length || !Matches(actual, 0, expected))
        {
            return false;
        }

        byte[] endpoint = new byte[1];
        if (!ReadProcessMemory(
                process,
                new IntPtr(unchecked((long)candidate)),
                endpoint,
                endpoint.Length,
                out bytesRead
            ) || bytesRead.ToInt64() != endpoint.Length)
        {
            return false;
        }
        return ReadProcessMemory(
            process,
            new IntPtr(unchecked((long)(candidate + ramEndAddress))),
            endpoint,
            endpoint.Length,
            out bytesRead
        ) && bytesRead.ToInt64() == endpoint.Length;
    }

    public static ulong FindEeBase(IntPtr process)
    {
        const ulong maxAddress = 0x0000800000000000;
        const ulong mainProgramAddress = 0x001f9f80;
        const int chunkSize = 1024 * 1024;
        byte[] signature = {
            0xc0, 0xff, 0xbd, 0x27, 0x10, 0x00, 0xb2, 0xff,
            0x2d, 0x90, 0x80, 0x00, 0x00, 0x00, 0xb0, 0xff
        };

        ulong address = 0;
        while (address < maxAddress)
        {
            MemoryBasicInformation64 information;
            UIntPtr queryResult = VirtualQueryEx(
                process,
                new UIntPtr(address),
                out information,
                new UIntPtr(48)
            );
            if (queryResult.ToUInt64() == 0 || information.RegionSize == 0) break;

            if (IsReadable(information) && information.RegionSize <= 0x40000000)
            {
                for (ulong offset = 0; offset < information.RegionSize; offset += chunkSize)
                {
                    int request = (int)Math.Min(
                        (ulong)(chunkSize + signature.Length - 1),
                        information.RegionSize - offset
                    );
                    byte[] buffer = new byte[request];
                    IntPtr bytesRead;
                    if (!ReadProcessMemory(
                            process,
                            new IntPtr(unchecked((long)(information.BaseAddress + offset))),
                            buffer,
                            request,
                            out bytesRead
                        ))
                    {
                        continue;
                    }

                    int scanLength = Math.Min(bytesRead.ToInt32() - signature.Length + 1, chunkSize);
                    for (int cursor = 0; cursor < scanLength; cursor++)
                    {
                        if (!Matches(buffer, cursor, signature)) continue;
                        ulong hit = information.BaseAddress + offset + (ulong)cursor;
                        if (hit < mainProgramAddress) continue;
                        ulong candidate = hit - mainProgramAddress;
                        if (VerifyBase(process, candidate)) return candidate;
                    }
                }
            }

            ulong next = information.BaseAddress + information.RegionSize;
            if (next <= address) break;
            address = next;
        }
        return 0;
    }

    private static void ReadExact(IntPtr process, ulong address, byte[] buffer)
    {
        IntPtr bytesRead;
        if (!ReadProcessMemory(
                process,
                new IntPtr(unchecked((long)address)),
                buffer,
                buffer.Length,
                out bytesRead
            ) || bytesRead.ToInt64() != buffer.Length)
        {
            throw new InvalidOperationException(
                String.Format("Could not read EE RAM at 0x{0:X8}", address)
            );
        }
    }

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

    private static bool ActivateWindow(IntPtr window)
    {
        if (GetForegroundWindow() == window) return true;
        const int Restore = 9;
        ShowWindow(window, Restore);
        SwitchToThisWindow(window, true);
        Thread.Sleep(40);
        return GetForegroundWindow() == window || SetForegroundWindow(window);
    }

    private static void PressKey(IntPtr window, byte virtualKey)
    {
        if (!ActivateWindow(window))
        {
            throw new InvalidOperationException("Could not activate trigger window");
        }
        keybd_event(virtualKey, 0, 0, UIntPtr.Zero);
    }

    private static void ReleaseKey(byte virtualKey)
    {
        keybd_event(virtualKey, 0, 0x0002, UIntPtr.Zero);
    }

    public static int TracePlayers(
        IntPtr process,
        ulong eeBase,
        string outputPath,
        int durationMilliseconds,
        int sampleRate,
        byte[] triggerVirtualKeys,
        int[] triggerAtMilliseconds,
        int[] triggerHoldMilliseconds,
        string windowTitle
    )
    {
        if (
            triggerVirtualKeys.Length != triggerAtMilliseconds.Length
            || triggerVirtualKeys.Length != triggerHoldMilliseconds.Length
        )
        {
            throw new ArgumentException("Trigger arrays must have matching lengths");
        }
        const uint player1Address = 0x003bcc30;
        const uint playerSize = 0x8d0;
        const uint player2Address = player1Address + playerSize;
        byte[] player1 = new byte[playerSize];
        byte[] player2 = new byte[playerSize];
        long frequency = Stopwatch.Frequency;
        long interval = Math.Max(1, frequency / sampleRate);
        long duration = frequency * durationMilliseconds / 1000;
        long[] triggerAt = new long[triggerVirtualKeys.Length];
        long[] triggerReleaseAt = new long[triggerVirtualKeys.Length];
        bool[] triggerPressed = new bool[triggerVirtualKeys.Length];
        bool[] triggerReleased = new bool[triggerVirtualKeys.Length];
        for (int index = 0; index < triggerVirtualKeys.Length; index++)
        {
            triggerAt[index] = frequency * triggerAtMilliseconds[index] / 1000;
            triggerReleaseAt[index] =
                frequency * (triggerAtMilliseconds[index] + triggerHoldMilliseconds[index]) / 1000;
            triggerReleased[index] = triggerVirtualKeys[index] == 0;
        }
        long started = Stopwatch.GetTimestamp();
        long next = started;
        int count = 0;

        try
        {
            using (FileStream stream = new FileStream(
                outputPath,
                FileMode.Create,
                FileAccess.Write,
                FileShare.Read,
                1024 * 1024
            ))
            using (BinaryWriter writer = new BinaryWriter(stream))
            {
                writer.Write(Encoding.ASCII.GetBytes("T5PTRC01"));
                writer.Write(eeBase);
                writer.Write(frequency);
                writer.Write(player1Address);
                writer.Write(player2Address);
                writer.Write(playerSize);
                writer.Write(0);

                while (true)
                {
                    long now = Stopwatch.GetTimestamp();
                    long elapsed = now - started;
                    if (elapsed >= duration) break;
                    for (int index = 0; index < triggerVirtualKeys.Length; index++)
                    {
                        if (
                            !triggerPressed[index]
                            && triggerVirtualKeys[index] != 0
                            && elapsed >= triggerAt[index]
                        )
                        {
                            IntPtr window = FindWindow(windowTitle);
                            if (window == IntPtr.Zero)
                            {
                                throw new InvalidOperationException(
                                    "Could not find window: " + windowTitle
                                );
                            }
                            PressKey(window, triggerVirtualKeys[index]);
                            triggerPressed[index] = true;
                        }
                        if (
                            triggerPressed[index]
                            && !triggerReleased[index]
                            && elapsed >= triggerReleaseAt[index]
                        )
                        {
                            ReleaseKey(triggerVirtualKeys[index]);
                            triggerReleased[index] = true;
                        }
                    }
                    if (now < next)
                    {
                        Thread.SpinWait(64);
                        continue;
                    }

                    ReadExact(process, eeBase + player1Address, player1);
                    ReadExact(process, eeBase + player2Address, player2);
                    writer.Write(now - started);
                    writer.Write(player1);
                    writer.Write(player2);
                    count++;
                    next += interval;
                    if (next < now) next = now + interval;
                }

                stream.Position = 36;
                writer.Write(count);
            }
        }
        finally
        {
            for (int index = 0; index < triggerVirtualKeys.Length; index++)
            {
                if (triggerPressed[index] && !triggerReleased[index])
                {
                    ReleaseKey(triggerVirtualKeys[index]);
                }
            }
        }
        return count;
    }
}
'@

Add-Type -TypeDefinition $source
$process = if ($ProcessId -ne 0) {
  Get-Process -Id $ProcessId -ErrorAction Stop
}
else {
  Get-Process -Name $ProcessName -ErrorAction Stop | Select-Object -First 1
}
$handle = [Tekken5Pcsx2PlayerTraceNative]::OpenProcess(0x410, $false, $process.Id)
if ($handle -eq [IntPtr]::Zero) {
  throw "Could not open $ProcessName process $($process.Id) for read-only memory access"
}

try {
  if ($EeBase -eq 0) {
    Write-Host "Locating PCSX2 EE RAM mapping..."
    $EeBase = [Tekken5Pcsx2PlayerTraceNative]::FindEeBase($handle)
    if ($EeBase -eq 0) {
      throw "Could not locate the Tekken 5 EE RAM mapping"
    }
  }

  $absoluteOutput = [IO.Path]::GetFullPath($OutputPath)
  $directory = [IO.Path]::GetDirectoryName($absoluteOutput)
  if ($directory) {
    [IO.Directory]::CreateDirectory($directory) | Out-Null
  }
  Write-Host (
    "Capturing {0} ms of player state at {1} Hz..." -f $DurationMilliseconds, $SampleRate
  )
  $count = [Tekken5Pcsx2PlayerTraceNative]::TracePlayers(
    $handle,
    $EeBase,
    $absoluteOutput,
    $DurationMilliseconds,
    $SampleRate,
    [byte[]]@(
      $TriggerVirtualKey,
      $TriggerVirtualKey2,
      $TriggerVirtualKey3,
      $TriggerVirtualKey4,
      $TriggerVirtualKey5,
      $TriggerVirtualKey6
    ),
    [int[]]@(
      $TriggerAtMilliseconds,
      $TriggerAtMilliseconds2,
      $TriggerAtMilliseconds3,
      $TriggerAtMilliseconds4,
      $TriggerAtMilliseconds5,
      $TriggerAtMilliseconds6
    ),
    [int[]]@(
      $TriggerHoldMilliseconds,
      $TriggerHoldMilliseconds2,
      $TriggerHoldMilliseconds3,
      $TriggerHoldMilliseconds4,
      $TriggerHoldMilliseconds5,
      $TriggerHoldMilliseconds6
    ),
    $WindowTitle
  )
  Write-Host (
    "PCSX2 PID {0}; EE base 0x{1:X}; captured {2} player samples at {3} Hz" -f `
      $process.Id,
      $EeBase,
      $count,
      $SampleRate
  )
  Write-Host $absoluteOutput
}
finally {
  [void][Tekken5Pcsx2PlayerTraceNative]::CloseHandle($handle)
}
