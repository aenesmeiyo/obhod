# Релизы

Скачать установщик: **[GitHub Releases →](https://github.com/aenesmeiyo/obhod/releases/latest)**

| Файл | Размер | SHA-256 |
| --- | --- | --- |
| `Obhod-Setup-1.0.2.exe` | 115,9 МБ | `1D57ED766BFF33AA6EEDF02250797AB0071C8CEBA3C6E0A64AD7A55E1D423C9B` |
| `Obhod-Setup-1.0.1.exe` | 115,9 МБ | `6A80F3B7EC41A2BDA6D087FB1AA255491029345C41598DE887B4ED6E43CC647A` |
| `Obhod-Setup-1.0.0.exe` | 115,9 МБ | `B10636E4727652DB65F7F891A3FFA35A3BD56C6BF00E494AD6A5F24B602E8785` |

> Установщик — это один self-contained `.exe` с NSIS. Отдельные файлы приложения не нужны.

## Почему `.exe` не лежит в git

GitHub отклоняет файлы больше 100 МБ, а установщик Electron занимает ~116 МБ. Поэтому бинарники
прикрепляются к **GitHub Releases**, а не коммитятся в репозиторий. Это стандартная практика для
desktop-приложений: релиз — та самая «папка со сборкой», откуда можно скачать `.exe`.

Контрольные суммы и заметки к версиям хранятся здесь, в папке `releases/`.

## Проверка файла

```powershell
Get-FileHash .\Obhod-Setup-1.0.1.exe -Algorithm SHA256
# 6A80F3B7EC41A2BDA6D087FB1AA255491029345C41598DE887B4ED6E43CC647A
```
