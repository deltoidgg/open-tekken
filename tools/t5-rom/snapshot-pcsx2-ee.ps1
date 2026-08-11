param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,
  [string]$ProcessName = "pcsx2-qt",
  [int]$ProcessId = 0,
  [UInt64]$EeBase = 0
)

$ErrorActionPreference = "Stop"

$source = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class Tekken5Pcsx2SnapshotNative
{
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
            ) || bytesRead.ToInt64() != actual.Length)
        {
            return false;
        }
        if (!Matches(actual, 0, expected)) return false;

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

    public static byte[] ReadEeRam(IntPtr process, ulong eeBase)
    {
        const int ramSize = 0x02000000;
        const int chunkSize = 1024 * 1024;
        byte[] output = new byte[ramSize];
        for (int offset = 0; offset < ramSize; offset += chunkSize)
        {
            int request = Math.Min(chunkSize, ramSize - offset);
            byte[] chunk = new byte[request];
            IntPtr bytesRead;
            if (!ReadProcessMemory(
                    process,
                    new IntPtr(unchecked((long)(eeBase + (ulong)offset))),
                    chunk,
                    request,
                    out bytesRead
                ) || bytesRead.ToInt32() != request)
            {
                throw new InvalidOperationException(
                    String.Format("Could not read EE RAM at 0x{0:X8}", offset)
                );
            }
            Buffer.BlockCopy(chunk, 0, output, offset, request);
        }
        return output;
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
$handle = [Tekken5Pcsx2SnapshotNative]::OpenProcess(0x410, $false, $process.Id)
if ($handle -eq [IntPtr]::Zero) {
  throw "Could not open $ProcessName process $($process.Id) for read-only memory access"
}

try {
  if ($EeBase -eq 0) {
    Write-Host "Locating PCSX2 EE RAM mapping..."
    $EeBase = [Tekken5Pcsx2SnapshotNative]::FindEeBase($handle)
    if ($EeBase -eq 0) {
      throw "Could not locate the Tekken 5 EE RAM mapping"
    }
  }

  $absoluteOutput = [IO.Path]::GetFullPath($OutputPath)
  $directory = [IO.Path]::GetDirectoryName($absoluteOutput)
  if ($directory) {
    [IO.Directory]::CreateDirectory($directory) | Out-Null
  }
  $snapshot = [Tekken5Pcsx2SnapshotNative]::ReadEeRam($handle, $EeBase)
  [IO.File]::WriteAllBytes($absoluteOutput, $snapshot)
  Write-Host ("PCSX2 PID {0}; EE base 0x{1:X}; wrote {2} bytes" -f $process.Id, $EeBase, $snapshot.Length)
  Write-Host $absoluteOutput
}
finally {
  [void][Tekken5Pcsx2SnapshotNative]::CloseHandle($handle)
}
