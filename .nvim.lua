local disable_formatting = function(client)
    client.server_capabilities.documentFormattingProvider = false
    client.server_capabilities.documentRangeFormattingProvider = false
end

vim.lsp.config("jsonls", {
    on_attach = function(client)
        disable_formatting(client)
    end,
})

vim.lsp.config('sourcekit', {
  cmd = { 'xcrun', 'sourcekit-lsp' },
  filetypes = { 'swift' },
  root_markers = { 'Package.swift' },
})

vim.lsp.enable({ "jsonls", "ts_ls", "biome", "prismals", "sourcekit" })
