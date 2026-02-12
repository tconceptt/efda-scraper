import re
from playwright.sync_api import Playwright, sync_playwright, expect


def run(playwright: Playwright) -> None:
    browser = playwright.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()
    page.goto("https://id.eris.efda.gov.et/account/login?ReturnUrl=%2Fconnect%2Fauthorize%2Fcallback%3Fclient_id%3Deris-portal-spa%26redirect_uri%3Dhttps%253A%252F%252Fportal.eris.efda.gov.et%252Fauth-callback%253Fto%253Dsignin%26response_type%3Dcode%26scope%3Dopenid%2520profile%26state%3D13414c39a8b94b8fada7a1f97e0a8279%26code_challenge%3Drm8x0rdT13MygBioGQHfQSgMniOeCCLVIZ6nG4xTQ6s%26code_challenge_method%3DS256%26response_mode%3Dquery")
    page.get_by_role("textbox", name="Username Password").click()
    page.get_by_role("textbox", name="Username Password").fill("r")
    page.get_by_role("textbox", name="Username Password").click()
    page.get_by_role("textbox", name="Username Password").fill("rufica")
    page.get_by_role("textbox", name="**********").click()
    page.get_by_role("textbox", name="**********").fill("Rufpar@et#16")
    page.get_by_role("button", name="Login").click()
    page.get_by_role("link", name=" IImport").click()
    page.get_by_text("25868/IP/").click()
    page.locator("app-tabs").get_by_text("Products").click()
    page.get_by_text("Suppliers").click()

    # ---------------------
    context.close()
    browser.close()


with sync_playwright() as playwright:
    run(playwright)
