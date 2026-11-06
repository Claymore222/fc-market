-- Embedded into installed FC Market scripts; exporter sources and data paths stay unchanged.
local native_print = print
local function safe_text(value)
    local ok, text = pcall(tostring, value)
    return ok and text or "<tostring failed>"
end
local function start(name, directory, library)
    __FCMARKET_LOG_SEQUENCE = (__FCMARKET_LOG_SEQUENCE or 0) + 1
    local run = os.date("!%Y%m%d_%H%M%S") .. "_" .. math.floor(os.clock() * 1000) .. "_" .. __FCMARKET_LOG_SEQUENCE
    local self = { path = directory .. "/" .. run .. ".log", name = name, started = os.clock(), wall_started = os.time(), parent = __FCMARKET_ACTIVE_LOG }
    local warned = false
    function self:write(level, message)
        local ok, err = pcall(function()
            local f, why = io.open(self.path, "a")
            if not f then error(why) end
            local wrote, problem = f:write(os.date("!%Y-%m-%dT%H:%M:%SZ") .. " [" .. level .. "] " .. message .. "\n")
            local closed, close_error = f:close()
            if not wrote or not closed then error(problem or close_error) end
        end)
        if not ok and not warned then
            warned = true
            pcall(native_print, "[FC-LOG] Dosya logu yazılamadı: " .. self.path .. " | " .. safe_text(err))
        end
        return ok
    end
    function self:print(...)
        local active = __FCMARKET_ACTIVE_LOG
        if library and active and active ~= self then return active:print(...) end
        local parts = {}
        for i = 1, select("#", ...) do parts[#parts + 1] = safe_text(select(i, ...)) end
        self:write("INFO", table.concat(parts, "\t"))
        return native_print(...)
    end
    function self:trace(err)
        return debug and debug.traceback and debug.traceback(safe_text(err), 2) or safe_text(err)
    end
    function self:finish(ok, err)
        if not ok then self:write("ERROR", safe_text(err)) end
        self:write(ok and "END" or "FAILED", string.format("script=%s elapsed_seconds=%d elapsed_cpu_seconds=%.3f", name, os.time() - self.wall_started, os.clock() - self.started))
        if __FCMARKET_ACTIVE_LOG == self then __FCMARKET_ACTIVE_LOG = self.parent end
    end
    function self:callback(fn)
        return function(...)
            local previous = __FCMARKET_ACTIVE_LOG
            __FCMARKET_ACTIVE_LOG = self
            local args = table.pack(...)
            local result = table.pack(xpcall(function() return fn(table.unpack(args, 1, args.n)) end,
                function(err) return self:trace(err) end))
            __FCMARKET_ACTIVE_LOG = previous
            if not result[1] then self:write("CALLBACK_ERROR", result[2]); error(result[2], 0) end
            return table.unpack(result, 2, result.n)
        end
    end
    __FCMARKET_ACTIVE_LOG = self
    self:write("START", "script=" .. name .. " run=" .. run .. " | timestamps=UTC")
    return self
end
return { start = start }
